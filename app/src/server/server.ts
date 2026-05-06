import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, loadConfig } from "./config.js";
import type {
  AppConfig,
  Ak620StatusView,
  GpuStatus,
  PowerMode,
  SteamSessionState,
  SystemMetrics,
  SystemStatus,
} from "../shared/types.js";
import { getSystemController } from "./controller-factory.js";
import {
  applyLowPowerEnhancements,
  applyPowerMode,
  isVllmActive,
  stopVllmService,
} from "./power-controller.js";
import { getGpuStatus, getSystemMetrics, withEstimatedSystemPower } from "./system-monitor.js";
import { PowerTracker } from "./power-tracker.js";
import {
  appendMetric,
  purgeExpiredSteamQueue,
  readSteamSessionState,
  summarizeSteamQueue,
  writeSteamSessionState,
} from "./storage.js";
import { createPowerRouter } from "./api/power.js";
import { createLlmRouter } from "./api/llm.js";
import { createSystemRouter } from "./api/system.js";
import { createSteamRouter } from "./api/steam.js";
import {
  getConfiguredSystemToken,
  isAdminLoginConfigured,
  isAdminRoute,
  requireAdminToken,
  validateAdminCredentials,
} from "./security.js";

const controller = getSystemController();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootDir = path.resolve(__dirname, "../../..");
const isDevServer = process.argv[1]?.endsWith(path.join("src", "server", "server.ts")) ?? false;

function loadEnvFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return true;
}

function ensureDevAuthDefaults(): void {
  if (!isDevServer) {
    return;
  }

  const envCandidates = [
    process.env.VANTAGE_ENV_FILE,
    path.join(repoRootDir, ".env.vantage.local"),
    path.join(repoRootDir, ".env.vantage"),
    path.join(repoRootDir, "backend.env"),
    path.join(repoRootDir, ".env"),
  ].filter((value): value is string => Boolean(value));

  envCandidates.forEach((candidate) => {
    loadEnvFile(candidate);
  });

  process.env.VANTAGE_LLM_GATEWAY_TOKEN ??= "x";

  if (!process.env.VANTAGE_SYSTEM_TOKEN) {
    process.env.VANTAGE_SYSTEM_TOKEN = "vantage-dev-token";
  }

  if (!process.env.VANTAGE_ADMIN_USERNAME || !process.env.VANTAGE_ADMIN_PASSWORD_HASH) {
    const salt = Buffer.from("vantage-dev-salt");
    const hash = crypto.scryptSync("18184444", salt, 64);
    process.env.VANTAGE_ADMIN_USERNAME = process.env.VANTAGE_ADMIN_USERNAME ?? "admin";
    process.env.VANTAGE_ADMIN_PASSWORD_HASH = `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
    console.warn("[vantage-backend] dev auth defaults enabled (admin / 18184444). Override via .env.vantage.local or VANTAGE_* env vars.");
  }
}

ensureDevAuthDefaults();

const defaultDashboardDistDir = path.resolve(__dirname, "../../dist/client");
const dashboardDistDir = process.env.VANTAGE_DASHBOARD_DIST ?? defaultDashboardDistDir;
const dashboardIndexPath = path.join(dashboardDistDir, "index.html");
const runtimeDataDir = path.resolve(process.cwd(), "data");
const powerTracker = new PowerTracker(runtimeDataDir);

let powerHistory: { mode: PowerMode; timestamp: number }[] = [];
const MAX_HISTORY = 50;

function addPowerHistory(mode: PowerMode) {
  powerHistory.push({ mode, timestamp: Date.now() });
  if (powerHistory.length > MAX_HISTORY) {
    powerHistory.shift();
  }
}

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
const SYSTEM_STATE_PATH = process.env.VANTAGE_SYSTEM_STATE_PATH ?? path.join(runtimeDataDir, "system-state.json");

function loadCurrentMode(): PowerMode {
  try {
    if (fs.existsSync(SYSTEM_STATE_PATH)) {
      const raw = fs.readFileSync(SYSTEM_STATE_PATH, 'utf8');
      const state = JSON.parse(raw);
      if (state.currentMode && ['DEFAULT', 'LOW_POWER', 'STANDARD_250', 'STANDARD_280', 'ADAPTIVE'].includes(state.currentMode)) {
        return state.currentMode as PowerMode;
      }
    }
  } catch (err) {
    console.error('[server] failed to load system state, using DEFAULT:', err);
  }
  return 'DEFAULT';
}

function saveCurrentMode(mode: PowerMode): void {
  try {
    const state = { currentMode: mode, lastUpdated: Date.now() };
    fs.writeFileSync(SYSTEM_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[server] failed to save system state:', err);
  }
}

let currentMode: PowerMode = loadCurrentMode();
let lastUsedAt: number | null = null;
let llmGatewayEnabled = config.llmGateway.enabled;
let adaptiveTransitionInProgress = false;
let steamSessionState: SteamSessionState = readSteamSessionState();

function setSteamSessionState(next: SteamSessionState): void {
  steamSessionState = next;
  writeSteamSessionState(next);
}

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
  const statePath = path.join(runtimeDataDir, "ak620-state.json");
  try {
    if (fs.existsSync(statePath)) {
      const raw = fs.readFileSync(statePath, "utf8");
      const state = JSON.parse(raw) as {
        connected: boolean;
        currentTarget: string;
        barLevel: number;
        temperatureC: number;
      };
      return {
        connected: state.connected,
        currentTarget: state.currentTarget as "CPU" | "GPU0" | "GPU1",
        barLevel: state.barLevel as 1 | 2 | 3,
        temperatureC: gpuTemp,
        refreshIntervalSeconds: config.ak620.refreshIntervalSeconds,
        minRefreshInterval: config.ak620.minRefreshInterval,
        maxRefreshInterval: config.ak620.maxRefreshInterval,
      };
    }
  } catch (err) {
    console.error("[server] failed to read AK620 state", err);
  }
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

app.use("/api", createPowerRouter({
  getCurrentMode: () => currentMode,
  setCurrentMode: (mode: PowerMode) => { currentMode = mode; saveCurrentMode(mode); },
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
  controller: controller,
}));

app.use("/api", createSteamRouter({
  getConfig: () => config,
  getCurrentMode: () => currentMode,
  markLlmActivity: markLlmActivity,
  getSteamSessionState: () => steamSessionState,
  setSteamSessionState: setSteamSessionState,
}));

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

app.post("/api/login", (req, res) => {
  if (!isAdminLoginConfigured()) {
    res.status(503).json({ error: "Admin login is not configured" });
    return;
  }

  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validateAdminCredentials(username, password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = getConfiguredSystemToken();
  if (!token) {
    res.status(503).json({ error: "Admin token is not configured" });
    return;
  }

  res.json({ ok: true, token });
});

app.get("/api/status", async (_req, res) => {
  const [gpus, baseSystem] = await Promise.all([getGpuStatus(), getSystemMetrics()]);
  const system = withEstimatedSystemPower(gpus, baseSystem);
  const gpu0 = gpus.find((g) => g.index === 0);

  const { queue } = purgeExpiredSteamQueue();
  const queueSummary = summarizeSteamQueue(queue);

  const status: SystemStatus = {
    mode: currentMode,
    llmGatewayEnabled,
    llmReady: await isVllmActive(),
    lastUsedAt,
    steamSessionActive: currentMode === "ADAPTIVE" ? steamSessionState.active : false,
    steamSessionStartedAt: currentMode === "ADAPTIVE" ? steamSessionState.startedAt : null,
    queueSummary,
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

// GET /api/system-metrics - MiniChart용 시계열 데이터 (크로스플랫폼)
app.get("/api/system-metrics", async (_req, res) => {
  const [gpus, system] = await Promise.all([getGpuStatus(), getSystemMetrics()]);
  const gpu0 = gpus.find((g) => g.index === 0);
  // 크로스플랫폼: Windows/Linux 모두 systeminformation으로 수집된 데이터 반환
  const metrics = {
    timestamp: Date.now(),
    // GPU 데이터 (nvidia-smi가 없으면 0, but data exists on Windows!)
    gpu0Power: gpu0?.powerW ?? 0,
    gpu0Temp: gpu0?.temperatureC ?? 0,
    gpu0Util: gpu0?.utilization ?? 0,
    gpu0MemUsed: gpu0?.memoryUsedMiB ?? 0,
    gpu0MemTotal: gpu0?.memoryTotalMiB ?? 0,
    // 시스템 데이터 (systeminformation 사용 - 크로스플랫폼)
    estimatedSystemPowerW: system.estimatedSystemPowerW ?? system.basePowerEstimateW ?? 0,
    cpuUsagePercent: system.cpuUsagePercent ?? 0,
    cpuPowerW: system.cpuPowerW ?? 0,
    memoryUsedGb: system.memoryUsedGb ?? 0,
    memoryTotalGb: system.memoryTotalGb ?? 0,
    // 온도
    cpuTemp: system.temperatures?.cpu_package ?? 0,
    // 기본 전력 추정치 (Windows/Linux 공용)
    basePowerEstimateW: system.basePowerEstimateW ?? 55,
  };
  res.json(metrics);
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
} else if (isDevServer) {
  console.log("[vantage-backend] dashboard dist not found in dev mode; expecting Vite dev server on :5173");
} else {
  console.warn(`[vantage-backend] dashboard dist not found: ${dashboardDistDir}`);
}

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

function evaluateSteamWatchdog(now: number): void {
  if (!steamSessionState.active || !steamSessionState.watchdogExpiresAt) {
    return;
  }
  if (now <= steamSessionState.watchdogExpiresAt) {
    return;
  }

  setSteamSessionState({
    active: false,
    startedAt: null,
    lastUpdatedAt: now,
    watchdogExpiresAt: null,
    replayRequestedAt: now,
  });
  console.warn("[steam] watchdog timeout reached, forcing session inactive state");
}

async function ensureAdaptiveState(): Promise<void> {
  const now = Date.now();
  evaluateSteamWatchdog(now);

  if (adaptiveTransitionInProgress || currentMode !== "ADAPTIVE" || !llmGatewayEnabled) {
    return;
  }

  if (steamSessionState.active || steamSessionState.replayRequestedAt !== null) {
    return;
  }

  const idleTimeoutMs = config.llmGateway.idleTimeoutMinutes * 60 * 1000;
  if (!lastUsedAt) {
    return;
  }

  const idleElapsed = now - lastUsedAt;
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

process.on('uncaughtException', (err) => {
  console.error('[vantage-backend] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[vantage-backend] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
