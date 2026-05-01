export type PowerMode = "LOW_POWER" | "STANDARD_250" | "STANDARD_280" | "TURBO" | "ADAPTIVE";

export interface GpuStatus {
  index: number;
  temperatureC: number;
  powerW: number;
  powerLimitW: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  utilization: number;
}

export interface SystemMetrics {
  cpuUsagePercent: number;
  cpuCoresUsagePercent: number[];
  cpuClockMhz: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  cpuPowerW: number | null;
  basePowerEstimateW: number;
  estimatedSystemPowerW: number | null;
  temperatures: Record<string, number>;
  serviceStatus: Record<string, string>;
  degraded: boolean;
  degradedReason?: string;
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
  system: SystemMetrics;
  gateway: GatewayStatusView;
  ak620: Ak620StatusView;
  alerts: string[];
}

export interface PowerHistoryEntry {
  mode: PowerMode;
  timestamp: number;
}

export interface MetricEnvelope<T> {
  metrics: T[];
  total: number;
}

export interface HistoryEnvelope {
  history: PowerHistoryEntry[];
  total: number;
}

export interface LogEnvelope {
  service: string;
  lines: string[];
}

export interface ApiOk {
  ok: true;
}
