import express, { Router } from "express";
import { applyLowPowerEnhancements, applyPowerMode, startVllmService, stopVllmService } from "../power-controller.js";
import type { AppConfig } from "../types.js";

export function createLlmRouter(deps: {
  getConfig: () => AppConfig;
  markLlmActivity: () => void;
  saveConfig: (mutator: (draft: AppConfig) => void) => void;
  getLlmGatewayEnabled: () => boolean;
  setLlmGatewayEnabled: (enabled: boolean) => void;
}): Router {
  const router = express.Router();

  router.post("/llm-gateway/enabled", (req, res) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be boolean" });
      return;
    }

    deps.setLlmGatewayEnabled(enabled);
    deps.saveConfig((draft) => {
      draft.llmGateway.enabled = enabled;
    });

    if (enabled) {
      deps.markLlmActivity();
    }
    res.json({ ok: true, enabled: deps.getLlmGatewayEnabled() });
  });

  router.post("/llm/touch", (_req, res) => {
    deps.markLlmActivity();
    res.json({ ok: true, lastUsedAt: Date.now() });
  });

  router.post("/llm/start", async (_req, res) => {
    const config = deps.getConfig();
    try {
      await applyPowerMode(config.llmGateway.activePowerMode);
      await startVllmService();
      deps.markLlmActivity();
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to start vLLM", error);
      res.status(500).json({
        error: "Failed to start vLLM",
        message: "vLLM start command failed",
      });
    }
  });

  router.post("/llm/stop", async (_req, res) => {
    const config = deps.getConfig();
    try {
      await stopVllmService();
      await applyPowerMode(config.llmGateway.idlePowerMode);
      await applyLowPowerEnhancements(config);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to stop vLLM", error);
      res.status(500).json({
        error: "Failed to stop vLLM",
        message: "vLLM stop command failed",
      });
    }
  });

  return router;
}
