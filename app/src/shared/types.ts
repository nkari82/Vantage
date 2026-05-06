export type PowerMode = "DEFAULT" | "LOW_POWER" | "STANDARD_250" | "STANDARD_280" | "ADAPTIVE";

export interface GpuStatus {
  index: number;
  temperatureC: number;
  powerW: number;
  powerLimitW: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  utilization: number;
}

export interface FileSystemMetrics {
  mount: string;
  sizeGb: number;
  usedGb: number;
  usePercent: number;
}

export interface NetworkMetrics {
  interface: string;
  rxSec: number;
  txSec: number;
}

export interface OsMetrics {
  distro: string;
  kernel: string;
  uptime: number;
}

export interface SystemMetrics {
  cpuUsagePercent: number;
  cpuCoresUsagePercent: number[];
  cpuClockMhz: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  memoryInstalledGb?: number;
  memoryClockMhz?: number;
  storage: FileSystemMetrics[];
  network: NetworkMetrics[];
  os: OsMetrics;
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

export type SteamQueueJobStatus = "queued" | "processing" | "completed" | "failed";

export interface SteamQueueSummary {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface SteamRequestSnapshot {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export interface SteamResultSnapshot {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface SteamQueueJob {
  jobId: string;
  createdAt: number;
  updatedAt: number;
  status: SteamQueueJobStatus;
  requestSnapshot: SteamRequestSnapshot;
  resultSnapshot: SteamResultSnapshot | null;
  error: string | null;
  idempotencyKey: string | null;
  payloadHash: string;
  ttlExpiresAt: number;
}

export interface SteamSessionState {
  active: boolean;
  startedAt: number | null;
  lastUpdatedAt: number;
  watchdogExpiresAt: number | null;
  replayRequestedAt: number | null;
}

export interface SteamSessionStartResponse {
  ok: true;
  steamSessionActive: boolean;
  steamSessionStartedAt: number;
  queueSummary: SteamQueueSummary;
  idempotent: boolean;
}

export interface SteamSessionEndResponse {
  ok: true;
  steamSessionActive: boolean;
  steamSessionEndedAt: number;
  queueSummary: SteamQueueSummary;
  replayRequested: boolean;
}

export interface SteamSessionStatusResponse {
  ok: true;
  adaptiveMode: boolean;
  steamSessionActive: boolean;
  steamSessionStartedAt: number | null;
  watchdogExpiresAt: number | null;
  replayRequestedAt: number | null;
  shouldReplay: boolean;
  queueSummary: SteamQueueSummary;
}

export interface SteamReplayStatusResponse {
  ok: true;
  adaptiveMode: boolean;
  shouldReplay: boolean;
  replayRequestedAt: number | null;
  steamSessionActive: boolean;
  queueSummary: SteamQueueSummary;
}

export interface SteamReplayRequestResponse {
  ok: true;
  replayRequestedAt: number;
  idempotent: boolean;
}

export interface SteamQueueEnqueueResponse {
  ok: true;
  jobId: string;
  status: SteamQueueJobStatus;
  deduped: boolean;
}

export interface QueueJobStatus {
  ok: true;
  job: SteamQueueJob;
}

export interface SystemStatus {
  mode: PowerMode;
  llmGatewayEnabled: boolean;
  llmReady: boolean;
  lastUsedAt: number | null;
  steamSessionActive: boolean;
  steamSessionStartedAt: number | null;
  queueSummary: SteamQueueSummary;
  gpus: GpuStatus[];
  system: SystemMetrics;
  gateway: GatewayStatusView;
  ak620: Ak620StatusView;
  alerts: string[];
}

export interface Ak620Config {
  refreshIntervalSeconds: number;
  minRefreshInterval: number;
  maxRefreshInterval: number;
}

export interface AlertConfig {
  gpuTempThresholdC: number;
  memoryUsageThresholdPercent: number;
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

export interface PowerTrackingConfig {
  basePowerEstimateW: number;
  powerCostPerKwh: number;
}

export interface AppConfig {
  ak620: Ak620Config;
  lowPowerMode: LowPowerModeConfig;
  llmGateway: LlmGatewayConfig;
  powerModes: Record<Exclude<PowerMode, "ADAPTIVE">, PowerModeDetail>;
  alerts: AlertConfig;
  powerTracking: PowerTrackingConfig;
}

export interface PowerModeHistory {
  timestamp: number;
  fromMode: PowerMode;
  toMode: PowerMode;
  reason: string;
  duration: number;
}

export interface GpuMetrics {
  timestamp: number;
  gpuIndex: number;
  temperatureC: number;
  powerW: number;
  powerLimitW: number;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  utilization: number;
}

export interface PowerStats {
  month: number;
  year: number;
  totalKwh: number;
  cost: number;
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
