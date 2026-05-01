import express from "express";
import fs from "node:fs";
import { CONFIG_PATH, loadConfig } from "./config.js";
import { runCommand } from "./shell.js";
import type { AppConfig, Ak620StatusView, PowerMode, SystemStatus } from "./types.js";
import {
  applyLowPowerEnhancements,
  applyPowerMode,
  isVllmActive,
  startVllmService,
  stopVllmService,
} from "./power-controller.js";
import { getGpuStatus } from "./system-monitor.js";
import { appendMetric } from "./storage.js";
import { createPowerRouter } from "./api/power.js";
import { createLlmRouter } from "./api/llm.js";
import { createSystemRouter } from "./api/system.js";

let powerHistory: { mode: PowerMode; timestamp: number }[] = [];
const MAX_HISTORY = 50;

function addPowerHistory(mode: PowerMode) {
  powerHistory.push({ mode, timestamp: Date.now() });
  if (powerHistory.length > MAX_HISTORY) {
    powerHistory.shift();
  }
}

// Metrics collection
setInterval(async () => {
  const gpus = await getGpuStatus();
  gpus.forEach((gpu) => {
    appendMetric("gpu-metrics.jsonl", gpu);
  });
}, 10_000);

const app = express();
app.use(express.json());

let config = loadConfig();
let currentMode: PowerMode = "ADAPTIVE";
let lastUsedAt: number | null = null;
let llmGatewayEnabled = config.llmGateway.enabled;
let adaptiveTransitionInProgress = false;

function markLlmActivity(): void {
  lastUsedAt = Date.now();
}

function saveConfig(mutator: (draft: AppConfig) => void): AppConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as AppConfig;
  mutator(parsed);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), "utf8");
  config = loadConfig();
  return config;
}

function makeAk620View(gpuTemp: number): Ak620StatusView {
  return {
    connected: true,
    currentTarget: "GPU0",
    barLevel: 2,
    temperatureC: gpuTemp,
    refreshIntervalSeconds: config.ak620.refreshIntervalSeconds,
    minRefreshInterval: config.ak620.minRefreshInterval,
    maxRefreshInterval: config.ak620.maxRefreshInterval,
  };
}

// Routers
app.use("/api", createPowerRouter({
  getCurrentMode: () => currentMode,
  setCurrentMode: (mode: PowerMode) => { currentMode = mode; },
  getPowerHistory: () => powerHistory,
  addPowerHistory: addPowerHistory,
  getConfig: () => config,
  markLlmActivity: markLlmActivity
}));

app.use("/api", createLlmRouter({
  getConfig: () => config,
  markLlmActivity: markLlmActivity,
  saveConfig: saveConfig,
  getLlmGatewayEnabled: () => llmGatewayEnabled,
  setLlmGatewayEnabled: (enabled: boolean) => { llmGatewayEnabled = enabled; }
}));

app.use("/api", createSystemRouter({
  getConfig: () => config,
  makeAk620View: makeAk620View,
  saveConfig: saveConfig
}));

// Remaining routes
app.get("/api/config", (_req, res) => {
  res.json(config);
});

app.post("/api/config", (req, res) => {
  const newConfig = req.body as Partial<AppConfig>;
  saveConfig((draft) => {
    if (newConfig.llmGateway) {
      draft.llmGateway = { ...draft.llmGateway, ...newConfig.llmGateway };
    }
    if (newConfig.ak620) {
      draft.ak620 = { ...draft.ak620, ...newConfig.ak620 };
    }
  });
  res.json({ ok: true, config });
});

app.get("/api/status", async (_req, res) => {
  const gpus = await getGpuStatus();
  const gpu0 = gpus.find((g) => g.index === 0);

  const status: SystemStatus = {
    mode: currentMode,
    llmGatewayEnabled,
    llmReady: await isVllmActive(),
    lastUsedAt,
    gpus,
    gateway: {
      enabled: llmGatewayEnabled,
      upstreamUrl: config.llmGateway.upstreamUrl,
      listenPort: config.llmGateway.listenPort,
      idleTimeoutMinutes: config.llmGateway.idleTimeoutMinutes,
      lastUsedAt,
      idleRemainingSeconds: getIdleRemainingSeconds(),
    },
    ak620: makeAk620View(gpu0?.temperatureC ?? 0),
    alerts: checkAlerts(gpus),
  };
  res.json(status);
});

// Helpers
function getIdleRemainingSeconds(): number {
  if (!lastUsedAt) {
    return config.llmGateway.idleTimeoutMinutes * 60;
  }
  const idleTimeoutMs = config.llmGateway.idleTimeoutMinutes * 60 * 1000;
  const remain = Math.ceil((idleTimeoutMs - (Date.now() - lastUsedAt)) / 1000);
  return Math.max(0, remain);
}

function checkAlerts(gpus: any[]): string[] {
  const alerts: string[] = [];
  for (const gpu of gpus) {
    if (gpu.temperatureC >= config.alerts.gpuTempThresholdC) {
      alerts.push(`GPU ${gpu.index} High Temp: ${gpu.temperatureC}°C`);
    }
    const memUsage = (gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100;
    if (memUsage >= config.alerts.memoryUsageThresholdPercent) {
      alerts.push(`GPU ${gpu.index} High Mem: ${memUsage.toFixed(1)}%`);
    }
  }
  return alerts;
}

async function ensureAdaptiveState(): Promise<void> {
  if (adaptiveTransitionInProgress || currentMode !== "ADAPTIVE" || !llmGatewayEnabled) {
    return;
  }

  const idleTimeoutMs = config.llmGateway.idleTimeoutMinutes * 60 * 1000;
  if (!lastUsedAt) {
    return;
  }

  const idleElapsed = Date.now() - lastUsedAt;
  if (idleElapsed < idleTimeoutMs) {
    return;
  }

  adaptiveTransitionInProgress = true;
  try {
    await stopVllmService();
    await applyPowerMode(config.llmGateway.idlePowerMode);
    await applyLowPowerEnhancements(config);
    console.log("[adaptive] transitioned to idle power mode after timeout");
  } catch (error) {
    console.error("[adaptive] failed idle transition", error);
  } finally {
    adaptiveTransitionInProgress = false;
  }
}

setInterval(() => {
  void ensureAdaptiveState();
}, 15_000);

const port = process.env.PORT ?? 18080;
app.listen(port, () => {
  console.log(`[vantage-backend] listening on ${port}`);
});
