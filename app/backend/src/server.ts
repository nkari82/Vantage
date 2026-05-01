import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, loadConfig } from "./config.js";
import type { AppConfig, Ak620StatusView, GpuStatus, PowerMode, SystemMetrics, SystemStatus } from "./types.js";
import {
  applyLowPowerEnhancements,
  applyPowerMode,
  isVllmActive,
  stopVllmService,
} from "./power-controller.js";
import { getGpuStatus, getSystemMetrics, withEstimatedSystemPower } from "./system-monitor.js";
import { PowerTracker } from "./power-tracker.js";
import { appendMetric } from "./storage.js";
import { createPowerRouter } from "./api/power.js";
import { createLlmRouter } from "./api/llm.js";
import { createSystemRouter } from "./api/system.js";
import { isAdminRoute, requireAdminToken } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDistDir = process.env.VANTAGE_DASHBOARD_DIST ?? path.resolve(__dirname, "../../dashboard/dist");
const dashboardIndexPath = path.join(dashboardDistDir, "index.html");
const powerTracker = new PowerTracker(path.resolve(__dirname, "../data"));

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

  const system = withEstimatedSystemPower(gpus, await getSystemMetrics());
  appendMetric("system-metrics.jsonl", system);
  
  if (system.estimatedSystemPowerW !== null) {
    powerTracker.addEnergy(system.estimatedSystemPowerW, 10_000);
  }
}, 10_000);

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vantage-backend" });
});
app.use((req, res, next) => {
  if (isAdminRoute(req.method, req.path)) {
    requireAdminToken(req, res, next);
    return;
  }

  next();
});

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
  markLlmActivity: markLlmActivity,
}));

app.use("/api", createLlmRouter({
  getConfig: () => config,
  markLlmActivity: markLlmActivity,
  saveConfig: saveConfig,
  getLlmGatewayEnabled: () => llmGatewayEnabled,
  setLlmGatewayEnabled: (enabled: boolean) => { llmGatewayEnabled = enabled; },
}));

app.use("/api", createSystemRouter({
  getConfig: () => config,
  makeAk620View: makeAk620View,
  saveConfig: saveConfig,
  powerTracker: powerTracker,
}));

// Remaining API routes
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
  const [gpus, baseSystem] = await Promise.all([getGpuStatus(), getSystemMetrics()]);
  const system = withEstimatedSystemPower(gpus, baseSystem);
  const gpu0 = gpus.find((g) => g.index === 0);

  const status: SystemStatus = {
    mode: currentMode,
    llmGatewayEnabled,
    llmReady: await isVllmActive(),
    lastUsedAt,
    gpus,
    system,
    gateway: {
      enabled: llmGatewayEnabled,
      upstreamUrl: config.llmGateway.upstreamUrl,
      listenPort: config.llmGateway.listenPort,
      idleTimeoutMinutes: config.llmGateway.idleTimeoutMinutes,
      lastUsedAt,
      idleRemainingSeconds: getIdleRemainingSeconds(),
    },
    ak620: makeAk620View(gpu0?.temperatureC ?? 0),
    alerts: checkAlerts(gpus, system),
  };
  res.json(status);
});

if (fs.existsSync(dashboardIndexPath)) {
  app.use(express.static(dashboardDistDir, { extensions: ["html"], immutable: true, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api") {
      next();
      return;
    }

    res.sendFile(dashboardIndexPath);
  });
} else {
  console.warn(`[vantage-backend] dashboard dist not found: ${dashboardDistDir}`);
}

// Helpers
function getIdleRemainingSeconds(): number {
  if (!lastUsedAt) {
    return config.llmGateway.idleTimeoutMinutes * 60;
  }
  const idleTimeoutMs = config.llmGateway.idleTimeoutMinutes * 60 * 1000;
  const remain = Math.ceil((idleTimeoutMs - (Date.now() - lastUsedAt)) / 1000);
  return Math.max(0, remain);
}

function checkAlerts(gpus: GpuStatus[], system: SystemMetrics): string[] {
  const alerts: string[] = [];
  if (system.degraded) {
    alerts.push(system.degradedReason ?? "System metrics degraded");
  }

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
    if (config.llmGateway.autoStopVllm) {
      await stopVllmService();
    }
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

const port = process.env.VANTAGE_BACKEND_PORT ?? process.env.PORT ?? 18080;
app.listen(port, () => {
  console.log(`[vantage-backend] listening on ${port}`);
  console.log(`[vantage-backend] dashboard dist: ${dashboardDistDir}`);
});
