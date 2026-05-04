import express from "express";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { URL } from "node:url";

const backendBase = process.env.VANTAGE_BACKEND_URL ?? "http://127.0.0.1:18080";
const upstreamBase = process.env.VANTAGE_UPSTREAM_URL ?? "http://127.0.0.1:8000";
const listenPort = Number(process.env.VANTAGE_LLM_GATEWAY_PORT ?? 8080);
const autoStart = (process.env.VANTAGE_AUTO_START_VLLM ?? "true") === "true";
const llmGatewayToken = process.env.VANTAGE_LLM_GATEWAY_TOKEN?.trim()
  ?? process.env.VANTAGE_SYSTEM_TOKEN?.trim()
  ?? "x";

const app = express();
app.use(express.json({ limit: "20mb" }));

const replayPollMs = Number(process.env.VANTAGE_STEAM_REPLAY_POLL_MS ?? 2000);
const replayMaxFailures = Number(process.env.VANTAGE_STEAM_REPLAY_MAX_FAILURES ?? 5);
const queueBodyLimitBytes = Number(process.env.VANTAGE_STEAM_QUEUE_BODY_LIMIT_BYTES ?? 2 * 1024 * 1024);
let replayWorkerRunning = false;

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vantage-llm-gateway" });
});

function makeBackendHeaders(): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  if (llmGatewayToken) {
    headers.set("authorization", `Bearer ${llmGatewayToken}`);
  }
  return headers;
}

async function postBackend(path: string): Promise<void> {
  const url = `${backendBase}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: makeBackendHeaders(),
    body: "{}",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend call failed (${response.status}): ${text}`);
  }
}

async function getBackendJson<T>(path: string): Promise<T> {
  const response = await fetch(`${backendBase}${path}`, {
    method: "GET",
    headers: makeBackendHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend GET failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

async function postBackendJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${backendBase}${path}`, {
    method: "POST",
    headers: makeBackendHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend POST failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

type SteamSessionStatusResponse = {
  ok: true;
  adaptiveMode: boolean;
  steamSessionActive: boolean;
  shouldReplay: boolean;
};

type EnqueueResponse = {
  ok: true;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  deduped: boolean;
};

type ClaimResponse = {
  ok: true;
  job: {
    jobId: string;
    requestSnapshot: {
      method: string;
      path: string;
      headers: Record<string, string>;
      body: string;
    };
  } | null;
};

function buildPayloadHash(method: string, originalUrl: string, body: string): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ method, path: originalUrl, body }))
    .digest("hex");
}

function shouldForwardHeader(key: string): boolean {
  const lowered = key.toLowerCase();
  return ![
    "host",
    "content-length",
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "x-vantage-admin-token",
  ].includes(lowered);
}

function normalizeIncomingHeaders(headers: express.Request["headers"]): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (!shouldForwardHeader(key)) {
      return;
    }
    if (typeof value === "string") {
      normalized[key] = value;
      return;
    }
    if (Array.isArray(value)) {
      normalized[key] = value.join(",");
    }
  });
  return normalized;
}

function ensureBodyWithinLimit(body: string): void {
  if (Buffer.byteLength(body, "utf8") > queueBodyLimitBytes) {
    throw new Error(`Request body too large for queueing (limit=${queueBodyLimitBytes} bytes)`);
  }
}

async function readRequestBody(req: express.Request): Promise<string> {
  if (typeof req.body === "string") {
    ensureBodyWithinLimit(req.body);
    return req.body;
  }
  if (req.body && Object.keys(req.body).length > 0) {
    const jsonBody = JSON.stringify(req.body);
    ensureBodyWithinLimit(jsonBody);
    return jsonBody;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += piece.length;
    if (total > queueBodyLimitBytes) {
      throw new Error(`Request body too large for queueing (limit=${queueBodyLimitBytes} bytes)`);
    }
    chunks.push(piece);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function streamProgrammaticUpstream(job: ClaimResponse["job"]): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    if (!job) {
      reject(new Error("job is required"));
      return;
    }

    const upstreamUrl = new URL(`${upstreamBase}${job.requestSnapshot.path}`);
    const isHttps = upstreamUrl.protocol === "https:";
    const transport = isHttps ? https : http;

    const proxyReq = transport.request(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port,
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        method: job.requestSnapshot.method,
        headers: {
          ...job.requestSnapshot.headers,
          host: upstreamUrl.host,
          "content-length": Buffer.byteLength(job.requestSnapshot.body).toString(),
        },
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const headers: Record<string, string> = {};
          Object.entries(proxyRes.headers).forEach(([key, value]) => {
            if (typeof value === "string") {
              headers[key] = value;
              return;
            }
            if (Array.isArray(value)) {
              headers[key] = value.join(",");
            }
          });
          resolve({
            statusCode: proxyRes.statusCode ?? 502,
            headers,
            body,
          });
        });
      },
    );

    proxyReq.on("error", reject);
    proxyReq.write(job.requestSnapshot.body);
    proxyReq.end();
  });
}

async function ensureReplayReady(): Promise<boolean> {
  try {
    await postBackend("/api/llm/start");
    await postBackend("/api/llm/touch");
    return true;
  } catch (error) {
    console.warn("[steam-replay] vLLM not ready for replay", error);
    return false;
  }
}

async function runReplayWorkerOnce(): Promise<void> {
  const session = await getBackendJson<SteamSessionStatusResponse>("/api/steam/session/status");
  if (!session.adaptiveMode || !session.shouldReplay) {
    return;
  }

  if (autoStart) {
    const ready = await ensureReplayReady();
    if (!ready) {
      return;
    }
  }

  let failureCount = 0;

  while (true) {
    const claimed = await postBackendJson<ClaimResponse>("/api/steam/queue/claim", {});
    if (!claimed.job) {
      break;
    }

    try {
      const result = await streamProgrammaticUpstream(claimed.job);
      await postBackendJson(`/api/steam/queue/${claimed.job.jobId}/complete`, {
        resultSnapshot: result,
      });
      await postBackend("/api/llm/touch");
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      await postBackendJson(`/api/steam/queue/${claimed.job.jobId}/fail`, {
        error: error instanceof Error ? error.message : "Unknown replay error",
      });
      if (failureCount >= replayMaxFailures) {
        console.error("[steam-replay] reached consecutive failure limit, pausing drain loop");
        return;
      }
    }
  }

  await postBackendJson("/api/steam/queue/replay/finish", {});
}

function startReplayWorker(): void {
  setInterval(() => {
    if (replayWorkerRunning) {
      return;
    }

    replayWorkerRunning = true;
    void runReplayWorkerOnce()
      .catch((error) => {
        console.error("[steam-replay] worker failed", error);
      })
      .finally(() => {
        replayWorkerRunning = false;
      });
  }, replayPollMs);
}

function proxyToUpstream(req: express.Request, res: express.Response): void {
  const upstreamUrl = new URL(`${upstreamBase}${req.originalUrl}`);
  const isHttps = upstreamUrl.protocol === "https:";
  const transport = isHttps ? https : http;

  const startTime = Date.now();
  let firstTokenTime = 0;
  let tokens = 0;

  const proxyReq = transport.request(
    {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port,
      path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
      method: req.method,
      headers: {
        ...req.headers,
        host: upstreamUrl.host,
      },
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode ?? 502);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, value as string | string[]);
        }
      });

      proxyRes.on("data", (chunk) => {
        if (firstTokenTime === 0) {
          firstTokenTime = Date.now();
          console.log(`[Metrics] TTFL: ${firstTokenTime - startTime}ms`);
        }

        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.substring(6);
            if (content === '[DONE]') continue;
            try {
              const json = JSON.parse(content);
              if (json.usage && json.usage.total_tokens) {
                tokens = json.usage.total_tokens;
              }
            } catch (e) {
              // 무시
            }
          }
        }
      });

      proxyRes.on("end", () => {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`[Metrics] Total Tokens: ${tokens}, TPS: ${(tokens / duration).toFixed(2)}`);
      });

      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    res.status(502).json({
      error: "Upstream proxy error",
      message: error.message,
    });
  });

  if (typeof req.body === "string") {
    proxyReq.write(req.body);
    proxyReq.end();
    return;
  }

  req.pipe(proxyReq);
}

app.get("/api/steam/queue/:jobId", async (req, res) => {
  try {
    const response = await fetch(`${backendBase}/api/steam/queue/${encodeURIComponent(req.params.jobId)}`, {
      method: "GET",
      headers: makeBackendHeaders(),
    });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(502).json({
      error: "Failed to query queue job",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/steam/queue/:jobId/result", async (req, res) => {
  try {
    const response = await fetch(`${backendBase}/api/steam/queue/${encodeURIComponent(req.params.jobId)}/result`, {
      method: "GET",
      headers: makeBackendHeaders(),
    });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(502).json({
      error: "Failed to query queue job result",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use("/v1", async (req, res) => {
  try {
    const requestBody = await readRequestBody(req);
    const session = await getBackendJson<SteamSessionStatusResponse>("/api/steam/session/status");

    if (session.steamSessionActive) {
      const payloadHash = buildPayloadHash(req.method, req.originalUrl, requestBody);
      const idempotencyKey = req.header("idempotency-key")?.trim() || payloadHash;
      const enqueue = await postBackendJson<EnqueueResponse>("/api/steam/queue/enqueue", {
        idempotencyKey,
        requestSnapshot: {
          method: req.method,
          path: req.originalUrl,
          headers: normalizeIncomingHeaders(req.headers),
          body: requestBody,
        },
      });

      res.status(202).json({
        ok: true,
        jobId: enqueue.jobId,
        status: enqueue.status,
        deduped: enqueue.deduped,
      });
      return;
    }

    if (autoStart) {
      await postBackend("/api/llm/start");
    }
    await postBackend("/api/llm/touch");

    if (requestBody) {
      req.headers["content-length"] = Buffer.byteLength(requestBody).toString();
    }
    req.body = requestBody;
  } catch (error) {
    res.status(503).json({
      error: "Failed to prepare vLLM",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }

  proxyToUpstream(req, res);
});

startReplayWorker();

app.listen(listenPort, () => {
  // eslint-disable-next-line no-console
  console.log(`[vantage-llm-gateway] listening on ${listenPort} -> ${upstreamBase}`);
});
