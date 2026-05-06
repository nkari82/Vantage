import type { CSSProperties } from "react";
import type {
  AppConfig,
  LogEntry,
  LogLevelFilter,
  PowerMode,
  PowerStats,
  SteamReplayStatusResponse,
  SteamSessionStatusResponse,
  SystemStatus,
} from "../../../shared/types";
import type { RailKey } from "./constants";

export interface StressStatus {
  isTesting: boolean;
  currentTest?: "cpu" | "memory";
  lastError?: string;
  lastFinishedAt?: number;
}

export interface AssistantInsight {
  title: string;
  detail: string;
  tone: "info" | "ok" | "warn" | "hot";
}

export interface StageMetric {
  label: string;
  value: string;
  detail: string;
}

export interface OverviewStat {
  eyebrow: string;
  value: string;
  delta: string;
  icon: string;
}

export interface CoreBarDatum {
  usage: number;
  style: CSSProperties;
}

export interface DashboardPageVisibility {
  isOverviewPage: boolean;
  isSignalsPage: boolean;
  isSteamPage: boolean;
  isGatewayPage: boolean;
  isSystemsPage: boolean;
  isSettingsPage: boolean;
  showSignalsCompactFlow: boolean;
  showHeroMetrics: boolean;
  showAnalyticsPage: boolean;
  showSteamPanel: boolean;
  showGatewayPanel: boolean;
  showCostPanel: boolean;
  showSettingsPageContent: boolean;
  showSystemsPageContent: boolean;
  showServiceHealthSection: boolean;
  showPowerTimelineSection: boolean;
  showLogsPanel: boolean;
}

export interface DashboardViewModel {
  activeRail: RailKey;
  status: SystemStatus | null;
  steamStatus: SteamSessionStatusResponse | null;
  steamReplay: SteamReplayStatusResponse | null;
  powerHistory: Array<{ mode: PowerMode; timestamp: number }>;
  powerStats: PowerStats | null;
  logEntries: LogEntry[];
  logService: string;
  logLines: number;
  logQuery: string;
  logLevel: LogLevelFilter;
  logSource: string | null;
  logTotal: number;
  logsUnavailable: boolean;
  config: AppConfig | null;
  isSavingConfig: boolean;
  gatewayToken: string;
  notice: string | null;
  error: string | null;
  stressStatus: StressStatus | null;
  currentPageCopy: { title: string; description: string };
  health: "ok" | "warn" | "bad";
  isWindows: boolean;
  estimatedSystemPower: number;
  totalGpuPower: number;
  cpuPowerLabel: string;
  queueLoad: number;
  memoryPercent: number;
  signalLabels: string[];
  modePolyline: string;
  cpuPolyline: string;
  thermalPolyline: string;
  thermalSignal: number[];
  gpuUtilizationValues: number[];
  vramPressureValues: number[];
  stageMetrics: StageMetric[];
  assistantInsights: AssistantInsight[];
  overviewStats: OverviewStat[];
  serviceEntries: Array<[string, string]>;
  activeServiceCount: number;
  maxStorageUse: number;
  networkLoad: number;
  gpuMemoryPressure: number;
  coreBars: CoreBarDatum[];
  focusGridClassName: string;
  systemsGridClassName: string;
  utilityGridClassName: string;
  visibility: DashboardPageVisibility;
}

export interface DashboardActions {
  navigateToPage: (page: RailKey) => void;
  handleLogout: () => void;
  setGatewayToken: (value: string) => void;
  saveGatewayToken: () => void;
  setLogService: (value: string) => void;
  setLogLines: (value: number) => void;
  setLogQuery: (value: string) => void;
  setLogLevel: (value: LogLevelFilter) => void;
  refreshLogs: () => void;
  setConfig: (next: AppConfig) => void;
  saveConfig: () => Promise<void>;
  applyDirectLink: () => Promise<void>;
  restartService: (service: string) => Promise<unknown>;
  runAction: (action: () => Promise<unknown>, success: string) => Promise<void>;
  confirmDangerousAction: (message: string, action: () => Promise<unknown>, success: string) => Promise<void>;
}
