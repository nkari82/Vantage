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

function getIdleRemainingSeconds(): number {
  if (!lastUsedAt) {
    return config.llmGateway.idleTimeoutMinutes * 60;
  }
  const idleTimeoutMs = config.llmGateway.idleTimeoutMinutes * 60 * 1000;
  const remain = Math.ceil((idleTimeoutMs - (Date.now() - lastUsedAt)) / 1000);
  return Math.max(0, remain);
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
    // eslint-disable-next-line no-console
    console.log("[adaptive] transitioned to idle power mode after timeout");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[adaptive] failed idle transition", error);
  } finally {
    adaptiveTransitionInProgress = false;
  }
}

setInterval(() => {
  void ensureAdaptiveState();
}, 15_000);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vantage-backend" });
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
  };
  res.json(status);
});

app.post("/api/mode", async (req, res) => {
  const mode = req.body?.mode as PowerMode | undefined;

  if (!mode || !["LOW_POWER", "STANDARD_250", "STANDARD_280", "TURBO", "ADAPTIVE"].includes(mode)) {
    res.status(400).json({ error: "Invalid mode" });
    return;
  }

  try {
    if (mode === "ADAPTIVE") {
      currentMode = "ADAPTIVE";
      markLlmActivity();
      res.json({ ok: true, mode: currentMode });
      return;
    }

    await applyPowerMode(mode);
    if (mode === "LOW_POWER") {
      await applyLowPowerEnhancements(config);
      await stopVllmService();
    }

    currentMode = mode;
    res.json({ ok: true, mode: currentMode });
  } catch (error) {
    res.status(500).json({
      error: "Failed to apply mode",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/llm-gateway/enabled", (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be boolean" });
    return;
  }

  llmGatewayEnabled = enabled;
  saveConfig((draft) => {
    draft.llmGateway.enabled = enabled;
  });

  if (enabled) {
    markLlmActivity();
  }
  res.json({ ok: true, enabled: llmGatewayEnabled });
});

app.post("/api/llm/touch", (_req, res) => {
  markLlmActivity();
  res.json({ ok: true, lastUsedAt });
});

app.post("/api/llm/start", async (_req, res) => {
  try {
    await applyPowerMode(config.llmGateway.activePowerMode);
    await startVllmService();
    markLlmActivity();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: "Failed to start vLLM",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/llm/stop", async (_req, res) => {
  try {
    await stopVllmService();
    await applyPowerMode(config.llmGateway.idlePowerMode);
    await applyLowPowerEnhancements(config);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: "Failed to stop vLLM",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/ak620/status", async (_req, res) => {
  const gpus = await getGpuStatus();
  const gpu0 = gpus.find((g) => g.index === 0);
  res.json(makeAk620View(gpu0?.temperatureC ?? 0));
});

app.post("/api/ak620/refresh-interval", (req, res) => {
  const next = Number(req.body?.seconds);
  if (!Number.isFinite(next)) {
    res.status(400).json({ error: "seconds must be number" });
    return;
  }

  const min = config.ak620.minRefreshInterval;
  const max = config.ak620.maxRefreshInterval;
  if (next < min || next > max) {
    res.status(400).json({ error: `seconds out of range (${min}-${max})` });
    return;
  }

  saveConfig((draft) => {
    draft.ak620.refreshIntervalSeconds = Math.round(next);
  });

  res.json({
    ok: true,
    refreshIntervalSeconds: config.ak620.refreshIntervalSeconds,
    note: "Restart vantage-ak620-agent.service to apply immediately",
  });
});

app.get("/api/logs", async (req, res) => {
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

app.post("/api/system/reboot", async (_req, res) => {
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

app.post("/api/system/shutdown", async (_req, res) => {
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

const port = Number(process.env.VANTAGE_BACKEND_PORT ?? 18080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[vantage-backend] listening on ${port}`);
});
