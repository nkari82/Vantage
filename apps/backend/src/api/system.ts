  router.get("/system-metrics", async (_req, res) => {
    const metrics = readMetrics("system-metrics.jsonl", 100);
    res.json({ metrics, total: metrics.length });
  });
import express, { Router } from "express";
import { runCommand } from "../shell.js";
import { getGpuStatus } from "../system-monitor.js";
import { readMetrics } from "../storage.js";
import type { Ak620StatusView, AppConfig } from "../types.js";

export function createSystemRouter(deps: {
  getConfig: () => AppConfig;
  makeAk620View: (gpuTemp: number) => Ak620StatusView;
  saveConfig: (mutator: (draft: AppConfig) => void) => void;
}): Router {
  const router = express.Router();

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
      note: "Restart vantage-ak620-agent.service to apply immediately",
    });
  });

  router.get("/logs", async (req, res) => {
    const service = String(req.query.service ?? "vantage-backend.service");
    const lines = Number(req.query.lines ?? 80);
    const safeLines = Number.isFinite(lines) ? Math.max(20, Math.min(300, lines)) : 80;

    try {
      const { stdout } = await runCommand("/bin/journalctl", ["-u", service, "-n", String(safeLines), "--no-pager"]);
      const parsed = stdout
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      res.json({ service, lines: parsed });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch logs",
        message: error instanceof Error ? error.message : "Unknown error",
        service,
      });
    }
  });

  router.post("/system/reboot", async (_req, res) => {
    try {
      await runCommand("/bin/systemctl", ["reboot"]);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to reboot system",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/system/shutdown", async (_req, res) => {
    try {
      await runCommand("/bin/systemctl", ["poweroff"]);
      res.json({ ok: true });
    } catch (error) {
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

  return router;
}
