export type PowerMode = "LOW_POWER" | "STANDARD_250" | "STANDARD_280" | "TURBO" | "ADAPTIVE";

export interface Ak620Config {
  refreshIntervalSeconds: number;
  minRefreshInterval: number;
  maxRefreshInterval: number;
}

export interface LowPowerModeConfig {
  gpuPowerLimitW: number;
  cpuGovernor: "powersave" | "performance" | "ondemand";
  stopServices: string[];
  nvmePowerSave: boolean;
  fanMinRpm: boolean;
}

export interface LlmGatewayConfig {
  enabled: boolean;
  upstreamUrl: string;
  listenPort: number;
  idleTimeoutMinutes: number;
  autoStartVllm: boolean;
  autoStopVllm: boolean;
  activePowerMode: Exclude<PowerMode, "ADAPTIVE">;
  idlePowerMode: Exclude<PowerMode, "ADAPTIVE">;
}

export interface PowerModeDetail {
  gpuPowerLimitW: number;
  cpuGovernor: "powersave" | "performance" | "ondemand";
  description: string;
}

export interface AppConfig {
  ak620: Ak620Config;
  lowPowerMode: LowPowerModeConfig;
  llmGateway: LlmGatewayConfig;
  powerModes: Record<Exclude<PowerMode, "ADAPTIVE">, PowerModeDetail>;
}

export interface GpuStatus {
  index: number;
  temperatureC: number;
  powerW: number;
  powerLimitW: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  utilization: number;
}

export interface GatewayStatusView {
  enabled: boolean;
  upstreamUrl: string;
  listenPort: number;
  idleTimeoutMinutes: number;
  lastUsedAt: number | null;
  idleRemainingSeconds: number;
}

export interface Ak620StatusView {
  connected: boolean;
  currentTarget: "CPU" | "GPU0" | "GPU1";
  barLevel: 1 | 2 | 3;
  temperatureC: number;
  refreshIntervalSeconds: number;
  minRefreshInterval: number;
  maxRefreshInterval: number;
}

export interface SystemStatus {
  mode: PowerMode;
  llmGatewayEnabled: boolean;
  llmReady: boolean;
  lastUsedAt: number | null;
  gpus: GpuStatus[];
  gateway: GatewayStatusView;
  ak620: Ak620StatusView;
}
