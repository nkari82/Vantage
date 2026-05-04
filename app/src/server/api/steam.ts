import crypto from "node:crypto";
import express, { Router } from "express";
import { applyLowPowerEnhancements, applyPowerMode, startVllmService, stopVllmService } from "../power-controller.js";
import {
  purgeExpiredSteamQueue,
  readSteamQueue,
  summarizeSteamQueue,
  writeSteamQueue,
} from "../storage.js";
import type {
  AppConfig,
  PowerMode,
  QueueJobStatus,
  SteamQueueEnqueueResponse,
  SteamQueueJob,
  SteamQueueSummary,
  SteamRequestSnapshot,
  SteamResultSnapshot,
  SteamSessionEndResponse,
  SteamSessionStartResponse,
  SteamSessionState,
} from "../../shared/types.js";

const QUEUE_MAX_SIZE = 50;
const RESULT_TTL_MS = 30 * 60 * 1000;
const WATCHDOG_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const PROCESSING_STALE_MS = 60 * 1000;

function badRequest(
  res: express.Response,
  errorCode: string,
  message: string,
  status = 400,
): void {
  res.status(status).json({ ok: false, errorCode, message });
}

function ensureAdaptiveMode(currentMode: PowerMode, res: express.Response): boolean {
  if (currentMode !== "ADAPTIVE") {
    badRequest(res, "STEAM_NOT_ADAPTIVE", "Steam session APIs are only available in ADAPTIVE mode", 409);
    return false;
  }
  return true;
}

function shouldPersistHeader(name: string): boolean {
  const lowered = name.toLowerCase();
  return ![
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "www-authenticate",
    "x-vantage-admin-token",
  ].includes(lowered);
}

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (!shouldPersistHeader(key)) {
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

function validateSnapshot(input: unknown): SteamRequestSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Partial<SteamRequestSnapshot> & { headers?: Record<string, unknown> };
  if (typeof raw.method !== "string" || typeof raw.path !== "string" || typeof raw.body !== "string") {
    return null;
  }

  const method = raw.method.toUpperCase();
  if (method !== "POST") {
    return null;
  }

  if (!raw.path.startsWith("/v1/")) {
    return null;
  }

  const headers = normalizeHeaders(raw.headers ?? {});
  return {
    method,
    path: raw.path,
    body: raw.body,
    headers,
  };
}

function computePayloadHash(snapshot: SteamRequestSnapshot): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ method: snapshot.method, path: snapshot.path, body: snapshot.body }))
    .digest("hex");
}

function nowQueueSummary(): SteamQueueSummary {
  const { queue } = purgeExpiredSteamQueue();
  return summarizeSteamQueue(queue);
}

export function createSteamRouter(deps: {
  getConfig: () => AppConfig;
  getCurrentMode: () => PowerMode;
  markLlmActivity: () => void;
  getSteamSessionState: () => SteamSessionState;
  setSteamSessionState: (next: SteamSessionState) => void;
}): Router {
  const router = express.Router();

  router.post("/steam/session/start", async (_req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }

    const state = deps.getSteamSessionState();
    if (state.active && state.startedAt) {
      const payload: SteamSessionStartResponse = {
        ok: true,
        steamSessionActive: true,
        steamSessionStartedAt: state.startedAt,
        queueSummary: nowQueueSummary(),
        idempotent: true,
      };
      res.json(payload);
      return;
    }

    const config = deps.getConfig();
    const now = Date.now();
    try {
      await stopVllmService();
      await applyPowerMode(config.llmGateway.idlePowerMode);
      if (config.llmGateway.idlePowerMode === "LOW_POWER") {
        await applyLowPowerEnhancements(config);
      }
      deps.markLlmActivity();

      const next: SteamSessionState = {
        active: true,
        startedAt: now,
        lastUpdatedAt: now,
        watchdogExpiresAt: now + WATCHDOG_TIMEOUT_MS,
        replayRequestedAt: null,
      };
      deps.setSteamSessionState(next);

      const payload: SteamSessionStartResponse = {
        ok: true,
        steamSessionActive: true,
        steamSessionStartedAt: now,
        queueSummary: nowQueueSummary(),
        idempotent: false,
      };
      res.json(payload);
    } catch (error) {
      console.error("[steam] failed to start steam session", error);
      badRequest(res, "SESSION_START_FAILED", "Failed to start steam session", 500);
    }
  });

  router.post("/steam/session/end", async (_req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }

    const state = deps.getSteamSessionState();
    if (!state.active) {
      badRequest(res, "SESSION_NOT_ACTIVE", "Steam session is not active", 409);
      return;
    }

    const config = deps.getConfig();
    const now = Date.now();

    try {
      await applyPowerMode(config.llmGateway.activePowerMode);
      await startVllmService();
      deps.markLlmActivity();

      deps.setSteamSessionState({
        active: false,
        startedAt: null,
        lastUpdatedAt: now,
        watchdogExpiresAt: null,
        replayRequestedAt: now,
      });

      const payload: SteamSessionEndResponse = {
        ok: true,
        steamSessionActive: false,
        steamSessionEndedAt: now,
        queueSummary: nowQueueSummary(),
        replayRequested: true,
      };
      res.json(payload);
    } catch (error) {
      console.error("[steam] failed to end steam session", error);
      badRequest(res, "SESSION_END_FAILED", "Failed to end steam session", 500);
    }
  });

  router.get("/steam/session/status", (_req, res) => {
    const state = deps.getSteamSessionState();
    const queueSummary = nowQueueSummary();
    const adaptiveMode = deps.getCurrentMode() === "ADAPTIVE";
    res.json({
      ok: true,
      adaptiveMode,
      steamSessionActive: adaptiveMode ? state.active : false,
      steamSessionStartedAt: adaptiveMode ? state.startedAt : null,
      watchdogExpiresAt: adaptiveMode ? state.watchdogExpiresAt : null,
      replayRequestedAt: adaptiveMode ? state.replayRequestedAt : null,
      shouldReplay: adaptiveMode && !state.active && state.replayRequestedAt !== null,
      queueSummary,
    });
  });

  router.post("/steam/queue/enqueue", (req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }

    const state = deps.getSteamSessionState();
    if (!state.active) {
      badRequest(res, "SESSION_NOT_ACTIVE", "Cannot enqueue while steam session is not active", 409);
      return;
    }

    const snapshot = validateSnapshot(req.body?.requestSnapshot);
    if (!snapshot) {
      badRequest(res, "INVALID_REQUEST_SNAPSHOT", "requestSnapshot must be a POST request to /v1/*");
      return;
    }

    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : null;
    const payloadHash = computePayloadHash(snapshot);

    const { queue } = purgeExpiredSteamQueue();
    if (idempotencyKey) {
      const existing = queue.find(
        (job) => job.idempotencyKey === idempotencyKey && job.payloadHash === payloadHash,
      );
      if (existing) {
        const deduped: SteamQueueEnqueueResponse = {
          ok: true,
          jobId: existing.jobId,
          status: existing.status,
          deduped: true,
        };
        res.status(202).json(deduped);
        return;
      }
    }

    if (queue.length >= QUEUE_MAX_SIZE) {
      badRequest(res, "QUEUE_OVERFLOW", "Steam queue is full", 503);
      return;
    }

    const now = Date.now();
    const job: SteamQueueJob = {
      jobId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: "queued",
      requestSnapshot: snapshot,
      resultSnapshot: null,
      error: null,
      idempotencyKey,
      payloadHash,
      ttlExpiresAt: Number.MAX_SAFE_INTEGER,
    };

    queue.push(job);
    writeSteamQueue(queue);

    const response: SteamQueueEnqueueResponse = {
      ok: true,
      jobId: job.jobId,
      status: job.status,
      deduped: false,
    };
    res.status(202).json(response);
  });

  router.get("/steam/queue/:jobId", (req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }
    const { queue } = purgeExpiredSteamQueue();
    const job = queue.find((item) => item.jobId === req.params.jobId);
    if (!job) {
      badRequest(res, "QUEUE_JOB_NOT_FOUND", "Queue job not found", 404);
      return;
    }

    const payload: QueueJobStatus = { ok: true, job };
    res.json(payload);
  });

  router.get("/steam/queue/:jobId/result", (req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }
    const { queue } = purgeExpiredSteamQueue();
    const job = queue.find((item) => item.jobId === req.params.jobId);
    if (!job) {
      badRequest(res, "QUEUE_JOB_NOT_FOUND", "Queue job not found", 404);
      return;
    }

    if (job.status !== "completed" || !job.resultSnapshot) {
      badRequest(res, "RESULT_NOT_READY", "Queue job result is not ready", 409);
      return;
    }

    res.json({ ok: true, jobId: job.jobId, result: job.resultSnapshot });
  });

  router.post("/steam/queue/claim", (_req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }

    const state = deps.getSteamSessionState();
    if (state.active) {
      badRequest(res, "SESSION_ACTIVE", "Cannot claim queue while steam session is active", 409);
      return;
    }

    const { queue } = purgeExpiredSteamQueue();

    const now = Date.now();
    queue.forEach((job) => {
      if (job.status === "processing" && now - job.updatedAt > PROCESSING_STALE_MS) {
        job.status = "queued";
        job.error = "Reclaimed stale processing lease";
        job.updatedAt = now;
      }
    });

    const nextJob = queue.find((job) => job.status === "queued");
    if (!nextJob) {
      res.json({ ok: true, job: null });
      return;
    }

    nextJob.status = "processing";
    nextJob.updatedAt = Date.now();
    nextJob.error = null;
    writeSteamQueue(queue);
    res.json({ ok: true, job: nextJob });
  });

  router.post("/steam/queue/:jobId/complete", (req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }
    const resultSnapshot = req.body?.resultSnapshot as SteamResultSnapshot | undefined;
    if (!resultSnapshot || typeof resultSnapshot.statusCode !== "number" || typeof resultSnapshot.body !== "string") {
      badRequest(res, "INVALID_RESULT_SNAPSHOT", "resultSnapshot is required");
      return;
    }

    const { queue } = purgeExpiredSteamQueue();
    const job = queue.find((item) => item.jobId === req.params.jobId);
    if (!job) {
      badRequest(res, "QUEUE_JOB_NOT_FOUND", "Queue job not found", 404);
      return;
    }

    if (job.status !== "processing") {
      badRequest(res, "INVALID_STATUS_TRANSITION", "Only processing jobs can be completed", 409);
      return;
    }

    job.status = "completed";
    job.updatedAt = Date.now();
    job.ttlExpiresAt = job.updatedAt + RESULT_TTL_MS;
    job.error = null;
    job.resultSnapshot = {
      statusCode: resultSnapshot.statusCode,
      headers: normalizeHeaders(resultSnapshot.headers ?? {}),
      body: resultSnapshot.body,
    };
    writeSteamQueue(queue);
    res.json({ ok: true, jobId: job.jobId, status: job.status });
  });

  router.post("/steam/queue/:jobId/fail", (req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }
    const errorMessage = typeof req.body?.error === "string" ? req.body.error : "Unknown replay error";

    const { queue } = purgeExpiredSteamQueue();
    const job = queue.find((item) => item.jobId === req.params.jobId);
    if (!job) {
      badRequest(res, "QUEUE_JOB_NOT_FOUND", "Queue job not found", 404);
      return;
    }

    if (job.status !== "processing") {
      badRequest(res, "INVALID_STATUS_TRANSITION", "Only processing jobs can be failed", 409);
      return;
    }

    job.status = "failed";
    job.updatedAt = Date.now();
    job.ttlExpiresAt = job.updatedAt + RESULT_TTL_MS;
    job.error = errorMessage;
    writeSteamQueue(queue);
    res.json({ ok: true, jobId: job.jobId, status: job.status });
  });

  router.post("/steam/queue/replay/request", (_req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }
    const current = deps.getSteamSessionState();
    if (current.active) {
      badRequest(res, "SESSION_ACTIVE", "Cannot request replay while steam session is active", 409);
      return;
    }
    if (current.replayRequestedAt !== null) {
      res.json({ ok: true, replayRequestedAt: current.replayRequestedAt, idempotent: true });
      return;
    }

    const now = Date.now();
    deps.setSteamSessionState({
      ...current,
      lastUpdatedAt: now,
      watchdogExpiresAt: null,
      replayRequestedAt: now,
    });
    res.json({ ok: true, replayRequestedAt: now, idempotent: false });
  });

  router.post("/steam/queue/replay/finish", (_req, res) => {
    if (!ensureAdaptiveMode(deps.getCurrentMode(), res)) {
      return;
    }
    const current = deps.getSteamSessionState();
    if (current.active) {
      badRequest(res, "SESSION_ACTIVE", "Cannot finish replay while steam session is active", 409);
      return;
    }
    if (current.replayRequestedAt === null) {
      badRequest(res, "REPLAY_NOT_REQUESTED", "Replay has not been requested", 409);
      return;
    }

    deps.setSteamSessionState({
      ...current,
      lastUpdatedAt: Date.now(),
      replayRequestedAt: null,
    });
    res.json({ ok: true });
  });

  router.get("/steam/queue/replay/status", (_req, res) => {
    const state = deps.getSteamSessionState();
    const queueSummary = nowQueueSummary();
    const adaptiveMode = deps.getCurrentMode() === "ADAPTIVE";
    res.json({
      ok: true,
      adaptiveMode,
      shouldReplay: adaptiveMode && !state.active && state.replayRequestedAt !== null,
      replayRequestedAt: adaptiveMode ? state.replayRequestedAt : null,
      steamSessionActive: adaptiveMode ? state.active : false,
      queueSummary,
    });
  });

  return router;
}
