import express, { Router } from "express";
import { applyLowPowerEnhancements, applyPowerMode, stopVllmService } from "../power-controller.js";
import type { PowerMode, AppConfig } from "../types.js";

export function createPowerRouter(deps: {
  getCurrentMode: () => PowerMode;
  setCurrentMode: (mode: PowerMode) => void;
  getPowerHistory: () => { mode: PowerMode; timestamp: number }[];
  addPowerHistory: (mode: PowerMode) => void;
  getConfig: () => AppConfig;
  markLlmActivity: () => void;
}): Router {
  const router = express.Router();

  router.post("/mode", async (req, res) => {
    const mode = req.body?.mode as PowerMode | undefined;

    if (!mode || !["LOW_POWER", "STANDARD_250", "STANDARD_280", "TURBO", "ADAPTIVE"].includes(mode)) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }

    try {
      if (mode === "ADAPTIVE") {
        deps.setCurrentMode("ADAPTIVE");
        deps.markLlmActivity();
        res.json({ ok: true, mode: deps.getCurrentMode() });
        return;
      }

      await applyPowerMode(mode);
      if (mode === "LOW_POWER") {
        await applyLowPowerEnhancements(deps.getConfig());
        await stopVllmService();
      }

      deps.setCurrentMode(mode);
      deps.addPowerHistory(mode);
      res.json({ ok: true, mode: deps.getCurrentMode() });
    } catch (error) {
      res.status(500).json({
        error: "Failed to apply mode",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/power-history", async (req, res) => {
    const history = deps.getPowerHistory();
    res.json({ history, total: history.length });
  });

  return router;
}
