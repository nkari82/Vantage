import fs from "node:fs";
import path from "node:path";
import type { SteamQueueJob, SteamQueueJobStatus, SteamQueueSummary, SteamSessionState } from "../shared/types.js";

const DATA_DIR = path.join(process.cwd(), "data");
const STEAM_QUEUE_PATH = path.join(DATA_DIR, "steam-queue.json");
const STEAM_SESSION_PATH = path.join(DATA_DIR, "steam-session.json");

const DEFAULT_SESSION_STATE: SteamSessionState = {
  active: false,
  startedAt: null,
  lastUpdatedAt: 0,
  watchdogExpiresAt: null,
  replayRequestedAt: null,
};

const TERMINAL_STATUSES = new Set<SteamQueueJobStatus>(["completed", "failed"]);

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function atomicWriteJson(filePath: string, data: unknown): void {
  ensureDataDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeQueueStatus(value: unknown): SteamQueueJobStatus | null {
  if (value === "queued" || value === "processing" || value === "completed" || value === "failed") {
    return value;
  }
  return null;
}

function sanitizeQueueJob(raw: unknown): SteamQueueJob | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Partial<SteamQueueJob>;
  const status = normalizeQueueStatus(item.status);
  if (
    typeof item.jobId !== "string"
    || typeof item.createdAt !== "number"
    || typeof item.updatedAt !== "number"
    || status === null
    || !item.requestSnapshot
    || typeof item.requestSnapshot !== "object"
    || typeof item.requestSnapshot.method !== "string"
    || typeof item.requestSnapshot.path !== "string"
    || typeof item.requestSnapshot.body !== "string"
    || !item.requestSnapshot.headers
    || typeof item.requestSnapshot.headers !== "object"
    || typeof item.payloadHash !== "string"
  ) {
    return null;
  }

  const headers: Record<string, string> = {};
  Object.entries(item.requestSnapshot.headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      headers[key] = value;
    }
  });

  const ttlExpiresAt = typeof item.ttlExpiresAt === "number" ? item.ttlExpiresAt : Number.MAX_SAFE_INTEGER;

  const resultSnapshot = item.resultSnapshot && typeof item.resultSnapshot === "object"
    && typeof item.resultSnapshot.statusCode === "number"
    && typeof item.resultSnapshot.body === "string"
    && item.resultSnapshot.headers
    && typeof item.resultSnapshot.headers === "object"
    ? {
      statusCode: item.resultSnapshot.statusCode,
      body: item.resultSnapshot.body,
      headers: Object.fromEntries(
        Object.entries(item.resultSnapshot.headers).filter(([, value]) => typeof value === "string"),
      ) as Record<string, string>,
    }
    : null;

  return {
    jobId: item.jobId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status,
    requestSnapshot: {
      method: item.requestSnapshot.method,
      path: item.requestSnapshot.path,
      body: item.requestSnapshot.body,
      headers,
    },
    resultSnapshot,
    error: typeof item.error === "string" ? item.error : null,
    idempotencyKey: typeof item.idempotencyKey === "string" ? item.idempotencyKey : null,
    payloadHash: item.payloadHash,
    ttlExpiresAt,
  };
}

export function appendMetric(filename: string, data: unknown): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  const entry = JSON.stringify({ ...(data as Record<string, unknown>), timestamp: Date.now() }) + "\n";
  fs.appendFileSync(filePath, entry, "utf8");
}

export function readMetrics(filename: string, limit = 100): unknown[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) return [];

  return content
    .split("\n")
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null);
}

export function readSteamQueue(): SteamQueueJob[] {
  if (!fs.existsSync(STEAM_QUEUE_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(STEAM_QUEUE_PATH, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => sanitizeQueueJob(entry))
      .filter((entry): entry is SteamQueueJob => entry !== null);
  } catch (error) {
    console.error("[storage] failed to read steam queue, fallback to empty", error);
    return [];
  }
}

export function writeSteamQueue(queue: SteamQueueJob[]): void {
  atomicWriteJson(STEAM_QUEUE_PATH, queue);
}

export function purgeExpiredSteamQueue(now = Date.now()): { queue: SteamQueueJob[]; removed: number } {
  const queue = readSteamQueue();
  const nextQueue = queue.filter((job) => {
    if (!TERMINAL_STATUSES.has(job.status)) {
      return true;
    }
    return job.ttlExpiresAt > now;
  });

  const removed = queue.length - nextQueue.length;
  if (removed > 0) {
    writeSteamQueue(nextQueue);
  }
  return { queue: nextQueue, removed };
}

export function summarizeSteamQueue(queue?: SteamQueueJob[]): SteamQueueSummary {
  const source = queue ?? readSteamQueue();
  return source.reduce<SteamQueueSummary>(
    (summary, job) => {
      if (job.status === "queued" || job.status === "processing" || job.status === "completed" || job.status === "failed") {
        summary[job.status] += 1;
      }
      return summary;
    },
    { queued: 0, processing: 0, completed: 0, failed: 0 },
  );
}

export function readSteamSessionState(): SteamSessionState {
  if (!fs.existsSync(STEAM_SESSION_PATH)) {
    return DEFAULT_SESSION_STATE;
  }

  try {
    const raw = fs.readFileSync(STEAM_SESSION_PATH, "utf8").trim();
    if (!raw) return DEFAULT_SESSION_STATE;
    const parsed = JSON.parse(raw) as Partial<SteamSessionState>;
    return {
      active: Boolean(parsed.active),
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
      lastUpdatedAt: typeof parsed.lastUpdatedAt === "number" ? parsed.lastUpdatedAt : 0,
      watchdogExpiresAt: typeof parsed.watchdogExpiresAt === "number" ? parsed.watchdogExpiresAt : null,
      replayRequestedAt: typeof parsed.replayRequestedAt === "number" ? parsed.replayRequestedAt : null,
    };
  } catch (error) {
    console.error("[storage] failed to read steam session state, fallback to default", error);
    return DEFAULT_SESSION_STATE;
  }
}

export function writeSteamSessionState(state: SteamSessionState): void {
  atomicWriteJson(STEAM_SESSION_PATH, state);
}

export function getSteamQueuePath(): string {
  return STEAM_QUEUE_PATH;
}

export function getSteamSessionPath(): string {
  return STEAM_SESSION_PATH;
}
