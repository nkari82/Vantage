import express, { Router } from "express";
import fs from "node:fs";
import { runCommand } from "../shell.js";
import { getGpuStatus, MONITORED_SERVICES } from "../system-monitor.js";
import { readMetrics } from "../storage.js";
import { getActualServiceName, getWindowsLogFilePath } from "../service-runtime.js";
import type { Ak620StatusView, AppConfig } from "../../shared/types.js";
import { PowerTracker } from "../power-tracker.js";

import { ISystemController } from "@vantage/common";
import { startStressTest, getStressStatus } from "../stress-runner.js";

async function readWindowsServiceLogs(service: string, safeLines: number): Promise<string[]> {
  const logPath = getWindowsLogFilePath(service);
  if (!fs.existsSync(logPath)) {
    return [`No Windows log file found for ${getActualServiceName(service, "win32")} at ${logPath}`];
  }

  const content = fs.readFileSync(logPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-safeLines);
}

export function createSystemRouter(deps: {
  getConfig: () => AppConfig;
  makeAk620View: (gpuTemp: number) => Ak620StatusView;
  saveConfig: (mutator: (draft: AppConfig) => void) => void;
  powerTracker: PowerTracker;
  controller: ISystemController;
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

  router.get("/logs", async (req, res) => {
    const service = String(req.query.service ?? "vantage-backend.service");
    if (!MONITORED_SERVICES.includes(service)) {
      res.status(400).json({ error: "Unsupported service" });
      return;
    }

    const lines = Number(req.query.lines ?? 80);
    const safeLines = Number.isFinite(lines) ? Math.max(20, Math.min(300, lines)) : 80;

    if (process.platform === "win32") {
      try {
        const parsed = await readWindowsServiceLogs(service, safeLines);
        res.json({ service, lines: parsed, source: "windows-log-file" });
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
      res.json({
        service,
        lines: ["System logs are only available on Linux journalctl or Windows Vantage log files."],
        unavailable: true,
      });
      return;
    }

    try {
      const { stdout } = await runCommand("/bin/journalctl", ["-u", service, "-n", String(safeLines), "--no-pager"]);
      const parsed = stdout
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      res.json({ service, lines: parsed, source: "journalctl" });
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
