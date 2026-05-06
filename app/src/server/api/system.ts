import express, { Router } from "express";
import fs from "node:fs";
import { getGpuStatus, MONITORED_SERVICES } from "../system-monitor.js";
import { readMetrics } from "../storage.js";
import { getActualServiceName, getWindowsLogFilePath } from "../service-runtime.js";
import type {
  Ak620StatusView,
  AppConfig,
  LogEntry,
  LogLevel,
  LogLevelFilter,
} from "../../shared/types.js";
import { PowerTracker } from "../power-tracker.js";
import { applyDirectLinkConfig, resolveDirectLinkStatus } from "../direct-link.js";
import { runCommand } from "../shell.js";

import { ISystemController } from "@vantage/common";
import { startStressTest, getStressStatus } from "../stress-runner.js";

function parseLogTimestamp(raw: string): number | null {
  const isoMatch = raw.match(/\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\b/);
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[1].replace(" ", "T"));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const journalMatch = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/i);
  if (journalMatch) {
    const candidate = `${journalMatch[0]} ${new Date().getFullYear()}`;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseLogLevel(raw: string): LogLevel {
  const normalized = raw.toLowerCase();
  if (normalized.includes("fatal") || normalized.includes("error") || normalized.includes("exception")) {
    return "error";
  }
  if (normalized.includes("warn")) {
    return "warn";
  }
  if (normalized.includes("debug") || normalized.includes("trace")) {
    return "debug";
  }
  if (normalized.includes("info") || normalized.includes("started") || normalized.includes("listening")) {
    return "info";
  }
  return "unknown";
}

function parseLogEntry(raw: string): LogEntry {
  return {
    raw,
    message: raw.replace(/^\[[^\]]+\]\s*/, "").trim(),
    level: parseLogLevel(raw),
    timestamp: parseLogTimestamp(raw),
  };
}

function filterLogEntries(entries: LogEntry[], filters: { query: string; level: LogLevelFilter; lines: number }): LogEntry[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (filters.level !== "all" && entry.level !== filters.level) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return entry.raw.toLowerCase().includes(normalizedQuery)
      || entry.message.toLowerCase().includes(normalizedQuery);
  });
  return filtered.slice(-filters.lines);
}

async function readWindowsServiceLogs(service: string): Promise<string[]> {
  const logPath = getWindowsLogFilePath(service);
  if (!fs.existsSync(logPath)) {
    return [`No Windows log file found for ${getActualServiceName(service, "win32")} at ${logPath}`];
  }

  const content = fs.readFileSync(logPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

export function createSystemRouter(deps: {
  getConfig: () => AppConfig;
  makeAk620View: (gpuTemp: number) => Ak620StatusView;
  saveConfig: (mutator: (draft: AppConfig) => void) => void;
  powerTracker: PowerTracker;
  controller: ISystemController;
  getDirectLinkLastAppliedAt: () => number | null;
  setDirectLinkLastAppliedAt: (timestamp: number | null) => void;
}): Router {
  const router = express.Router();

  router.post("/system/test/cpu", async (req, res) => {
    const duration = Number(req.body?.duration ?? 60);
    try {
      const result = startStressTest(deps.controller, "cpu", duration);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/system/test/memory", async (req, res) => {
    const duration = Number(req.body?.duration ?? 60);
    try {
      const result = startStressTest(deps.controller, "memory", duration);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/system/test/memtest", async (_req, res) => {
    try {
      await deps.controller.rebootToMemtest();
      res.json({ ok: true, message: "Rebooting to Memtest86..." });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get("/system/test/status", (_req, res) => {
    res.json(getStressStatus());
  });

  router.get("/system/power-stats", (_req, res) => {
    const stats = deps.powerTracker.getStats();
    const cost = stats.totalKwh * deps.getConfig().powerTracking.powerCostPerKwh;
    res.json({ ...stats, cost });
  });

  router.get("/ak620/status", async (_req, res) => {
    const gpus = await getGpuStatus();
    const gpu0 = gpus.find((g) => g.index === 0);
    res.json(deps.makeAk620View(gpu0?.temperatureC ?? 0));
  });

  router.get("/system/direct-link/status", async (_req, res) => {
    try {
      const status = await resolveDirectLinkStatus(deps.getConfig(), deps.getDirectLinkLastAppliedAt());
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: "Failed to read direct-link status",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/system/direct-link/apply", async (_req, res) => {
    try {
      await applyDirectLinkConfig(deps.getConfig());
      const timestamp = Date.now();
      deps.setDirectLinkLastAppliedAt(timestamp);
      const status = await resolveDirectLinkStatus(deps.getConfig(), timestamp);
      res.json({ ok: true, status });
    } catch (error) {
      res.status(500).json({
        error: "Failed to apply direct-link config",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/ak620/refresh-interval", (req, res) => {
    const next = Number(req.body?.seconds);
    if (!Number.isFinite(next)) {
      res.status(400).json({ error: "seconds must be number" });
      return;
    }

    const config = deps.getConfig();
    const min = config.ak620.minRefreshInterval;
    const max = config.ak620.maxRefreshInterval;
    if (next < min || next > max) {
      res.status(400).json({ error: `seconds out of range (${min}-${max})` });
      return;
    }

    deps.saveConfig((draft) => {
      draft.ak620.refreshIntervalSeconds = Math.round(next);
    });

    res.json({
      ok: true,
      refreshIntervalSeconds: deps.getConfig().ak620.refreshIntervalSeconds,
      note: process.platform === "linux"
        ? "Restart vantage-ak620-agent.service to apply immediately"
        : "Restart the Vantage AK620 Agent service to apply immediately",
    });
  });

  router.post("/system/services/:service/restart", async (req, res) => {
    const service = String(req.params.service ?? "");
    if (!MONITORED_SERVICES.includes(service)) {
      res.status(400).json({ error: "Unsupported service" });
      return;
    }

    try {
      await deps.controller.restartService(service);
      const active = await deps.controller.isServiceActive(service);
      res.json({
        ok: true,
        service,
        active,
        note: active
          ? `${service} restarted successfully`
          : `${service} restart requested but service is not active yet`,
      });
    } catch (error) {
      console.error("Failed to restart service", error);
      res.status(500).json({
        error: "Failed to restart service",
        message: error instanceof Error ? error.message : "Unknown error",
        service,
      });
    }
  });

  router.get("/logs", async (req, res) => {
    const service = String(req.query.service ?? "vantage-backend.service");
    if (!MONITORED_SERVICES.includes(service)) {
      res.status(400).json({ error: "Unsupported service" });
      return;
    }

    const lines = Number(req.query.lines ?? 80);
    const safeLines = Number.isFinite(lines) ? Math.max(20, Math.min(300, lines)) : 80;
    const rawLevel = String(req.query.level ?? "all").toLowerCase();
    const level: LogLevelFilter = rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn" || rawLevel === "error"
      ? rawLevel
      : "all";
    const query = String(req.query.query ?? "").trim();

    const respondWithEntries = (rawLines: string[], source?: string, unavailable = false) => {
      const parsedEntries = rawLines.map(parseLogEntry);
      const filteredEntries = filterLogEntries(parsedEntries, { query, level, lines: safeLines });
      res.json({
        service,
        lines: filteredEntries.map((entry) => entry.raw),
        entries: filteredEntries,
        total: filteredEntries.length,
        source,
        unavailable,
        filters: {
          lines: safeLines,
          query,
          level,
        },
      });
    };

    if (process.platform === "win32") {
      try {
        const parsed = await readWindowsServiceLogs(service);
        respondWithEntries(parsed, "windows-log-file");
      } catch (error) {
        console.error("Failed to fetch Windows logs", error);
        res.status(500).json({
          error: "Failed to fetch logs",
          message: error instanceof Error ? error.message : "Windows log read failed",
          service,
        });
      }
      return;
    }

    if (process.platform !== "linux") {
      respondWithEntries([
        "System logs are only available on Linux journalctl or Windows Vantage log files.",
      ], undefined, true);
      return;
    }

    try {
      const { stdout } = await runCommand("/bin/journalctl", ["-u", service, "-n", String(Math.max(safeLines * 4, 120)), "--no-pager"]);
      const parsed = stdout
        .split("\n")
        .map((line: string) => line.trimEnd())
        .filter((line: string) => line.length > 0);
      respondWithEntries(parsed, "journalctl");
    } catch (error) {
      console.error("Failed to fetch logs", error);
      res.status(500).json({
        error: "Failed to fetch logs",
        message: "journalctl command failed",
        service,
      });
    }
  });

  router.post("/system/reboot", async (_req, res) => {
    try {
      await deps.controller.restartSystem();
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to reboot system", error);
      res.status(500).json({
        error: "Failed to reboot system",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/system/shutdown", async (_req, res) => {
    try {
      await deps.controller.shutdownSystem();
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to shutdown system", error);
      res.status(500).json({
        error: "Failed to shutdown system",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/gpu-metrics", async (_req, res) => {
    const metrics = readMetrics("gpu-metrics.jsonl", 100);
    res.json({ metrics, total: metrics.length });
  });

  router.get("/system-metrics", async (_req, res) => {
    const metrics = readMetrics("system-metrics.jsonl", 100);
    res.json({ metrics, total: metrics.length });
  });

  return router;
}
