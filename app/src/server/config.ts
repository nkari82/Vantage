import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = process.env.VANTAGE_CONFIG_PATH ?? path.resolve(__dirname, "../../config.json");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function loadConfig(): AppConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as AppConfig;

  if (!parsed.ak620 || !parsed.lowPowerMode || !parsed.llmGateway || !parsed.powerModes) {
    throw new Error(`Invalid config schema at ${CONFIG_PATH}`);
  }

  const envRefresh = process.env.AK620_REFRESH_INTERVAL
    ? Number(process.env.AK620_REFRESH_INTERVAL)
    : undefined;

  const configuredRefresh = Number.isFinite(envRefresh)
    ? (envRefresh as number)
    : parsed.ak620.refreshIntervalSeconds;

  parsed.ak620.refreshIntervalSeconds = clamp(
    configuredRefresh,
    parsed.ak620.minRefreshInterval,
    parsed.ak620.maxRefreshInterval,
  );

  return parsed;
}

export { CONFIG_PATH };
