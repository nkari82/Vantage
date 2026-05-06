import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../shared/types.js";

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config.json");
const CONFIG_PATH = process.env.VANTAGE_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readConfigFile(filePath: string): Partial<AppConfig> {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as Partial<AppConfig>;
}

function mergeConfig(parsed: Partial<AppConfig>, defaults: AppConfig): AppConfig {
  return {
    ak620: {
      ...defaults.ak620,
      ...(parsed.ak620 ?? {}),
    },
    lowPowerMode: {
      ...defaults.lowPowerMode,
      ...(parsed.lowPowerMode ?? {}),
      stopServices: Array.isArray(parsed.lowPowerMode?.stopServices)
        ? parsed.lowPowerMode.stopServices.filter((value): value is string => typeof value === "string")
        : defaults.lowPowerMode.stopServices,
    },
    llmGateway: {
      ...defaults.llmGateway,
      ...(parsed.llmGateway ?? {}),
    },
    powerModes: {
      DEFAULT: {
        ...defaults.powerModes.DEFAULT,
        ...(parsed.powerModes?.DEFAULT ?? {}),
      },
      LOW_POWER: {
        ...defaults.powerModes.LOW_POWER,
        ...(parsed.powerModes?.LOW_POWER ?? {}),
      },
      STANDARD_250: {
        ...defaults.powerModes.STANDARD_250,
        ...(parsed.powerModes?.STANDARD_250 ?? {}),
      },
      STANDARD_280: {
        ...defaults.powerModes.STANDARD_280,
        ...(parsed.powerModes?.STANDARD_280 ?? {}),
      },
    },
    alerts: {
      ...defaults.alerts,
      ...(parsed.alerts ?? {}),
    },
    powerTracking: {
      ...defaults.powerTracking,
      ...(parsed.powerTracking ?? {}),
    },
  };
}

export function loadConfig(): AppConfig {
  const defaults = readConfigFile(DEFAULT_CONFIG_PATH) as AppConfig;
  const parsed = readConfigFile(CONFIG_PATH);
  const normalized = mergeConfig(parsed, defaults);

  const envRefresh = process.env.AK620_REFRESH_INTERVAL
    ? Number(process.env.AK620_REFRESH_INTERVAL)
    : undefined;

  const configuredRefresh = Number.isFinite(envRefresh)
    ? (envRefresh as number)
    : normalized.ak620.refreshIntervalSeconds;

  normalized.ak620.refreshIntervalSeconds = clamp(
    configuredRefresh,
    normalized.ak620.minRefreshInterval,
    normalized.ak620.maxRefreshInterval,
  );

  return normalized;
}

export { CONFIG_PATH };
