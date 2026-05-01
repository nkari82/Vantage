import express from "express";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const backendBase = process.env.VANTAGE_BACKEND_URL ?? "http://127.0.0.1:18080";
const upstreamBase = process.env.VANTAGE_UPSTREAM_URL ?? "http://127.0.0.1:8000";
const listenPort = Number(process.env.VANTAGE_LLM_GATEWAY_PORT ?? 8080);
const autoStart = (process.env.VANTAGE_AUTO_START_VLLM ?? "true") === "true";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vantage-llm-gateway" });
});

async function postBackend(path: string): Promise<void> {
  const url = `${backendBase}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend call failed (${response.status}): ${text}`);
  }
}

function proxyToUpstream(req: express.Request, res: express.Response): void {
  const upstreamUrl = new URL(`${upstreamBase}${req.originalUrl}`);
  const isHttps = upstreamUrl.protocol === "https:";
  const transport = isHttps ? https : http;

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
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    res.status(502).json({
      error: "Upstream proxy error",
      message: error.message,
    });
  });

  req.pipe(proxyReq);
}

app.use("/v1", async (req, res) => {
  try {
    if (autoStart) {
      await postBackend("/api/llm/start");
    }
    await postBackend("/api/llm/touch");
  } catch (error) {
    res.status(503).json({
      error: "Failed to prepare vLLM",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }

  proxyToUpstream(req, res);
});

app.listen(listenPort, () => {
  // eslint-disable-next-line no-console
  console.log(`[vantage-llm-gateway] listening on ${listenPort} -> ${upstreamBase}`);
});
