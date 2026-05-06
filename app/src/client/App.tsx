import { Component, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ErrorInfo, ReactNode } from "react";
import { LoginView } from "./components/dashboard/LoginView";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import {
  buildPolyline,
  getHealth,
  getRailFromHash,
  loginRequiredLogsMessage,
  modeLevel,
  railPageCopy,
  services,
  type RailKey,
} from "./components/dashboard/constants";
import type { DashboardActions, DashboardViewModel, StressStatus } from "./components/dashboard/types";
import { api } from "./lib/api";
import { clampPercent, fmtNumber, fmtTs } from "./lib/format";
import type {
  AppConfig,
  LogEntry,
  LogLevelFilter,
  PowerMode,
  PowerStats,
  SteamReplayStatusResponse,
  SteamSessionStatusResponse,
  SystemStatus,
} from "../shared/types";
import "./styles.css";

function hasAdminSession(): boolean {
  return Boolean(api.getAdminToken());
}

function isProtectedRouteFailure(message: string): boolean {
  return message.includes("Admin token required")
    || message.includes("HTTP 401")
    || message.includes("Expected JSON but received HTML from /api/");
}

function makeLogEntry(message: string, level: LogEntry["level"] = "info"): LogEntry {
  return {
    raw: message,
    message,
    level,
    timestamp: null,
  };
}

function LoadingView({ message }: { message: string }) {
  return (
    <main className="dashboard-shell dashboard-shell--reference">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />
      <div className="login-container glass-card">
        <div className="login-header">
          <p className="eyebrow">Vantage Mission Control</p>
          <h1>대시보드 준비 중</h1>
          <p className="hero__copy">{message}</p>
        </div>
      </div>
    </main>
  );
}

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "알 수 없는 렌더링 오류",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[DashboardErrorBoundary] render crash", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="dashboard-shell dashboard-shell--reference">
        <div className="aurora aurora--one" />
        <div className="aurora aurora--two" />
        <div className="login-container glass-card">
          <div className="login-header">
            <p className="eyebrow">Dashboard Runtime Error</p>
            <h1>대시보드 렌더링 오류</h1>
            <p className="hero__copy">{this.state.message}</p>
            <button onClick={() => window.location.reload()}>새로고침</button>
          </div>
        </div>
      </main>
    );
  }
}

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [steamStatus, setSteamStatus] = useState<SteamSessionStatusResponse | null>(null);
  const [steamReplay, setSteamReplay] = useState<SteamReplayStatusResponse | null>(null);
  const [powerHistory, setPowerHistory] = useState<Array<{ mode: PowerMode; timestamp: number }>>([]);
  const [powerStats, setPowerStats] = useState<PowerStats | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logService, setLogService] = useState<string>(services[0]);
  const [logLines, setLogLines] = useState(80);
  const [logQuery, setLogQuery] = useState("");
  const [logLevel, setLogLevel] = useState<LogLevelFilter>("all");
  const [logSource, setLogSource] = useState<string | null>(null);
  const [logTotal, setLogTotal] = useState(0);
  const [logsUnavailable, setLogsUnavailable] = useState(false);
  const [configDraft, setConfigDraft] = useState<AppConfig | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLogin, setIsLogin] = useState(() => !api.getAdminToken());
  const [isBootstrapping, setIsBootstrapping] = useState(() => Boolean(api.getAdminToken()));
  const [gatewayToken, setGatewayToken] = useState(() => api.getGatewayToken() || "x");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stressStatus, setStressStatus] = useState<StressStatus | null>(null);
  const [activeRail, setActiveRail] = useState<RailKey>(() => getRailFromHash(window.location.hash));

  function clearProtectedState(sessionExpired = false) {
    setSteamStatus(null);
    setSteamReplay(null);
    setPowerStats(null);
    setStressStatus(null);
    setLogEntries([makeLogEntry(loginRequiredLogsMessage)]);
    setLogSource(null);
    setLogTotal(0);
    setLogsUnavailable(false);
    setConfigDraft(null);
    setIsSavingConfig(false);
    setIsBootstrapping(false);

    if (sessionExpired) {
      api.setAdminToken("");
      setIsLogin(true);
      setLoginUser("");
      setLoginPass("");
      setLoginError("세션이 만료되었거나 인증 상태가 올바르지 않습니다. 다시 로그인해 주세요.");
      setNotice(null);
    }
  }

  async function refreshSteamData() {
    if (!hasAdminSession()) {
      setSteamStatus(null);
      setSteamReplay(null);
      return;
    }

    try {
      const [nextSteamStatus, nextReplay] = await Promise.all([
        api.steamSessionStatus(),
        api.steamReplayStatus(),
      ]);
      setSteamStatus(nextSteamStatus);
      setSteamReplay(nextReplay);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Steam 상태를 불러오지 못했습니다.";
      if (isProtectedRouteFailure(message)) {
        clearProtectedState(true);
        return;
      }
      setSteamStatus(null);
      setSteamReplay(null);
      setError(message);
    }
  }

  async function refreshStatus() {
    const nextStatus = await api.status();
    setStatus(nextStatus);
    await refreshSteamData();
  }

  async function refreshTelemetry() {
    const history = await api.powerHistory();
    setPowerHistory([...history.history].reverse());

    if (!hasAdminSession()) {
      setPowerStats(null);
      return;
    }

    try {
      const stats = await api.powerStats();
      setPowerStats(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : "전력 통계를 불러오지 못했습니다.";
      if (isProtectedRouteFailure(message)) {
        clearProtectedState(true);
        return;
      }
      setPowerStats(null);
      setError(message);
    }
  }

  async function loadLogs() {
    if (!hasAdminSession()) {
      setLogEntries([makeLogEntry(loginRequiredLogsMessage)]);
      setLogSource(null);
      setLogTotal(0);
      setLogsUnavailable(false);
      return;
    }

    try {
      const data = await api.logs(logService, logLines, logQuery, logLevel);
      const safeEntries = Array.isArray(data.entries) ? data.entries : [];
      setLogEntries(safeEntries);
      setLogSource(data.source ?? null);
      setLogTotal(Number.isFinite(data.total) ? data.total : safeEntries.length);
      setLogsUnavailable(Boolean(data.unavailable));
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그를 불러오지 못했습니다.";
      if (isProtectedRouteFailure(message)) {
        clearProtectedState(true);
        return;
      }
      setLogEntries([makeLogEntry(message, "error")]);
      setLogSource(null);
      setLogTotal(1);
      setLogsUnavailable(true);
    }
  }

  async function loadConfig() {
    if (!hasAdminSession()) {
      setConfigDraft(null);
      return;
    }

    try {
      const nextConfig = await api.getConfig();
      setConfigDraft(nextConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : "설정을 불러오지 못했습니다.";
      if (isProtectedRouteFailure(message)) {
        clearProtectedState(true);
        return;
      }
      setError(message);
    }
  }

  async function bootstrapDashboardData() {
    setIsBootstrapping(true);
    try {
      const nextStatus = await api.status();
      setStatus(nextStatus);
    } finally {
      setIsBootstrapping(false);
    }

    if (!hasAdminSession()) {
      setSteamStatus(null);
      setSteamReplay(null);
      void refreshTelemetry().catch(() => undefined);
      return;
    }

    void refreshSteamData().catch(() => undefined);
    void refreshTelemetry().catch(() => undefined);
    void loadLogs().catch(() => undefined);
    void loadConfig().catch(() => undefined);
    void api.stressStatus().then(setStressStatus).catch(() => undefined);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    try {
      setIsBootstrapping(true);
      const data = await api.login(loginUser, loginPass);
      api.setAdminToken(data.token, rememberMe);
      setLoginError(null);
      setNotice("로그인했습니다.");
      await bootstrapDashboardData();
      if (hasAdminSession()) {
        setIsLogin(false);
      }
    } catch (err) {
      setIsBootstrapping(false);
      const message = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setLoginError(message === "Invalid credentials" ? "잘못된 사용자 이름 또는 비밀번호입니다." : message);
    }
  }

  function handleLogout() {
    api.setAdminToken("");
    setIsLogin(true);
    setLoginUser("");
    setLoginPass("");
    setSteamStatus(null);
    setSteamReplay(null);
    setPowerStats(null);
    setStressStatus(null);
    setLogEntries([makeLogEntry(loginRequiredLogsMessage)]);
    setLogSource(null);
    setLogTotal(0);
    setLogsUnavailable(false);
    setConfigDraft(null);
    setIsSavingConfig(false);
    setIsBootstrapping(false);
    setNotice("로그아웃했습니다.");
  }

  function saveGatewayToken() {
    const nextGatewayToken = gatewayToken.trim();
    const normalizedGatewayToken = nextGatewayToken || "x";
    setGatewayToken(normalizedGatewayToken);
    api.setGatewayToken(nextGatewayToken, true);
    setNotice(
      normalizedGatewayToken === "x"
        ? "LLM Gateway token 기본값(x)을 사용합니다."
        : "LLM Gateway token을 저장했습니다.",
    );
  }

  async function saveSettingsConfig() {
    if (!configDraft) {
      return;
    }

    try {
      setIsSavingConfig(true);
      setError(null);
      const result = await api.saveConfig(configDraft);
      setConfigDraft(result.config);
      setNotice("설정을 저장했습니다.");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정을 저장하지 못했습니다.");
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    try {
      setError(null);
      await action();
      setNotice(success);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function confirmDangerousAction(message: string, action: () => Promise<unknown>, success: string) {
    if (!window.confirm(message)) {
      return;
    }

    await runAction(action, success);
  }

  useEffect(() => {
    if (hasAdminSession()) {
      void bootstrapDashboardData().catch((err: unknown) => {
        setIsBootstrapping(false);
        setError(err instanceof Error ? err.message : "대시보드를 초기화하지 못했습니다.");
      });
    } else {
      setIsBootstrapping(false);
      void refreshStatus().catch((err: unknown) => setError(err instanceof Error ? err.message : "상태 로드 실패"));
      void refreshTelemetry().catch(() => undefined);
    }

    const statusTimer = window.setInterval(() => {
      void refreshStatus().catch(() => undefined);
    }, 5_000);
    const telemetryTimer = window.setInterval(() => {
      void refreshTelemetry().catch(() => undefined);
    }, 10_000);
    const stressTimer = window.setInterval(() => {
      if (!hasAdminSession()) {
        setStressStatus(null);
        return;
      }

      void api.stressStatus().then(setStressStatus).catch(() => undefined);
    }, 2_000);

    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(telemetryTimer);
      window.clearInterval(stressTimer);
    };
  }, []);

  useEffect(() => {
    void loadLogs().catch(() => undefined);
  }, [logService, logLines, logQuery, logLevel]);

  useEffect(() => {
    const syncRailFromHash = () => {
      const nextRail = getRailFromHash(window.location.hash);
      setActiveRail((current) => (current === nextRail ? current : nextRail));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    syncRailFromHash();
    window.addEventListener("hashchange", syncRailFromHash);

    return () => {
      window.removeEventListener("hashchange", syncRailFromHash);
    };
  }, []);

  function navigateToPage(page: RailKey) {
    if (window.location.hash === `#${page}`) {
      setActiveRail(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    window.location.hash = page;
  }

  const system = status?.system;
  const gateway = status?.gateway;
  const gpuList = Array.isArray(status?.gpus) ? status.gpus : [];
  const totalGpuPower = useMemo(() => gpuList.reduce((acc, gpu) => acc + gpu.powerW, 0), [gpuList]);
  const safePowerHistory = Array.isArray(powerHistory) ? powerHistory : [];
  const estimatedSystemPower = system?.estimatedSystemPowerW ?? totalGpuPower;
  const cpuPowerLabel = system?.cpuPowerW === null || system?.cpuPowerW === undefined
    ? "CPU RAPL unavailable"
    : `CPU ${fmtNumber(system.cpuPowerW, 1)} W`;
  const isWindows = system?.os?.platform === "win32";
  const health = getHealth(status ?? undefined);
  const steamCounts = steamStatus?.queueSummary ?? status?.queueSummary ?? { queued: 0, processing: 0, completed: 0, failed: 0 };
  const queueLoad = steamCounts.queued + steamCounts.processing;
  const memoryPercent = system?.memoryTotalGb
    ? (system.memoryUsedGb / system.memoryTotalGb) * 100
    : 0;
  const avgGpuTemp = gpuList.length
    ? gpuList.reduce((acc, gpu) => acc + gpu.temperatureC, 0) / gpuList.length
    : 0;
  const coreBars = useMemo(
    () => (system?.cpuCoresUsagePercent ?? []).map((usage) => ({
      usage,
      style: { "--core-height": `${Math.max(8, clampPercent(usage))}%` } as CSSProperties,
    })),
    [system?.cpuCoresUsagePercent],
  );
  const modeSignal = useMemo(() => {
    const recent = safePowerHistory.slice(0, 8).reverse().map((entry) => modeLevel(entry.mode));
    return recent.length > 0 ? recent : [modeLevel(status?.mode ?? "DEFAULT")];
  }, [safePowerHistory, status?.mode]);
  const cpuSignal = useMemo(() => {
    const cpuCoreSeries = Array.isArray(system?.cpuCoresUsagePercent) ? system.cpuCoresUsagePercent : [];
    const series = cpuCoreSeries.slice(0, 8).filter((value) => Number.isFinite(value));
    const fallback = Number.isFinite(system?.cpuUsagePercent) ? system.cpuUsagePercent : 0;
    const nextSeries = series.length > 0 ? [...series] : [fallback];
    while (nextSeries.length < 6) {
      nextSeries.unshift(nextSeries[0]);
    }
    return nextSeries.slice(-8);
  }, [system?.cpuCoresUsagePercent, system?.cpuUsagePercent]);
  const thermalSignal = useMemo(() => {
    const primaryTemps = Object.values(system?.temperatures ?? {}).slice(0, 8);
    const fallbackTemps = gpuList.map((gpu) => gpu.temperatureC).slice(0, 8);
    const sourceSeries = primaryTemps.length > 0 ? primaryTemps : fallbackTemps;
    const series = (Array.isArray(sourceSeries) ? sourceSeries : []).filter((value) => Number.isFinite(value));
    const nextSeries = series.length > 0 ? [...series] : [avgGpuTemp];
    while (nextSeries.length < 6) {
      nextSeries.unshift(nextSeries[0]);
    }
    return nextSeries.slice(-8);
  }, [system?.temperatures, gpuList, avgGpuTemp]);
  const signalLabels = useMemo(() => Array.from({ length: modeSignal?.length ?? 0 }, (_, index) => `S${index + 1}`), [modeSignal]);
  const serviceEntries = Object.entries(system?.serviceStatus ?? {});
  const activeServiceCount = serviceEntries.filter(([, value]) => value === "active").length;
  const maxStorageUse = Math.max(0, ...(system?.storage ?? []).map((disk) => disk.usePercent));
  const networkLoad = (system?.network ?? []).reduce((acc, item) => acc + item.rxSec + item.txSec, 0) / 1024 / 1024;
  const gpuMemoryPressure = Math.max(0, ...gpuList.map((gpu) => (gpu.memoryUsedMiB / Math.max(gpu.memoryTotalMiB, 1)) * 100));
  const gpuUtilizationValues = useMemo(() => gpuList.map((gpu) => gpu.utilization), [gpuList]);
  const vramPressureValues = useMemo(
    () => gpuList.map((gpu) => (gpu.memoryUsedMiB / Math.max(gpu.memoryTotalMiB, 1)) * 100),
    [gpuList],
  );
  const assistantInsights = useMemo(() => {
    if (!status) {
      return [
        { title: "Syncing", detail: "서버 상태를 연결 중입니다.", tone: "info" as const },
        { title: "Telemetry", detail: "실시간 시그널이 수집되면 운영 인사이트가 갱신됩니다.", tone: "info" as const },
      ];
    }

    const notes: DashboardViewModel["assistantInsights"] = [];

    if (!steamStatus?.adaptiveMode) {
      notes.push({ title: "Steam Control", detail: "Steam 세션 제어는 ADAPTIVE 모드에서만 활성화됩니다.", tone: "warn" });
    } else if (steamStatus.steamSessionActive) {
      notes.push({ title: "Steam Live", detail: "세션이 활성 상태이며 종료 시 replay 플로우가 이어집니다.", tone: "ok" });
    }

    if (!status.llmGatewayEnabled) {
      notes.push({ title: "Gateway Offline", detail: "LLM 요청 전에 Gateway enable 상태를 먼저 확인하세요.", tone: "warn" });
    } else if (!status.llmReady) {
      notes.push({ title: "Gateway Warm-up", detail: "Gateway는 열려 있지만 vLLM 준비 상태가 아닙니다.", tone: "info" });
    }

    if (stressStatus?.isTesting) {
      notes.push({ title: "Stress Running", detail: `${stressStatus.currentTest ?? "system"} 테스트가 진행 중입니다.`, tone: "hot" });
    }

    const alertCount = status.alerts?.length ?? 0;
    if (alertCount > 0) {
      notes.push({ title: "Alerts", detail: `활성 알림 ${alertCount}건을 먼저 확인하세요.`, tone: "hot" });
    }

    if (notes.length === 0) {
      notes.push({ title: "Stable", detail: "현재 시스템은 안정 상태입니다. 모드와 Gateway 상태를 기준으로 운영하면 됩니다.", tone: "ok" });
      notes.push({ title: "Power", detail: `예상 시스템 전력은 약 ${fmtNumber(estimatedSystemPower, 0)}W 입니다.`, tone: "info" });
    }

    return notes.slice(0, 4);
  }, [estimatedSystemPower, status, steamStatus, stressStatus]);
  const stageMetrics = useMemo(() => ([
    { label: "Service Health", value: `${activeServiceCount}/${serviceEntries.length || 1}`, detail: "active runtime services" },
    { label: "Memory Pressure", value: `${fmtNumber(memoryPercent, 0)}%`, detail: `${fmtNumber(system?.memoryUsedGb ?? 0, 1)} / ${fmtNumber(system?.memoryTotalGb ?? 0, 1)} GB` },
    { label: "VRAM Pressure", value: `${fmtNumber(gpuMemoryPressure, 0)}%`, detail: "peak GPU memory occupancy" },
    { label: "Network Flow", value: `${fmtNumber(networkLoad, 2)} MB/s`, detail: `storage peak ${fmtNumber(maxStorageUse, 0)}%` },
  ]), [activeServiceCount, gpuMemoryPressure, maxStorageUse, memoryPercent, networkLoad, serviceEntries.length, system?.memoryTotalGb, system?.memoryUsedGb]);
  const overviewStats = useMemo(() => ([
    {
      eyebrow: "System Power",
      value: `${fmtNumber(estimatedSystemPower, 0)} W`,
      delta: cpuPowerLabel,
      icon: "◌",
    },
    {
      eyebrow: "Compute Mode",
      value: status?.mode ?? "SYNCING",
      delta: status?.llmReady ? "vLLM ready" : "warm-up",
      icon: "◎",
    },
    {
      eyebrow: "Gateway Status",
      value: status?.llmGatewayEnabled ? "Online" : "Paused",
      delta: `${gateway?.listenPort ?? "-"} port`,
      icon: "◈",
    },
    {
      eyebrow: "Replay Queue",
      value: `${queueLoad}`,
      delta: `${steamCounts.completed} completed`,
      icon: "◍",
    },
  ]), [cpuPowerLabel, estimatedSystemPower, queueLoad, status, steamCounts.completed]);
  const currentPageCopy = railPageCopy[activeRail];
  const visibility = {
    isOverviewPage: activeRail === "overview",
    isSignalsPage: activeRail === "signals",
    isSteamPage: activeRail === "steam",
    isGatewayPage: activeRail === "gateway",
    isSystemsPage: activeRail === "systems",
    isSettingsPage: activeRail === "settings",
    showSignalsCompactFlow: activeRail === "signals",
    showHeroMetrics: activeRail === "overview" || activeRail === "signals",
    showAnalyticsPage: activeRail === "overview" || activeRail === "signals",
    showSteamPanel: activeRail === "overview" || activeRail === "steam",
    showGatewayPanel: activeRail === "overview" || activeRail === "gateway",
    showCostPanel: activeRail === "overview" || activeRail === "signals",
    showSettingsPageContent: activeRail === "overview" || activeRail === "settings",
    showSystemsPageContent: activeRail === "overview" || activeRail === "systems",
    showServiceHealthSection: activeRail === "overview" || activeRail === "systems",
    showPowerTimelineSection: activeRail === "overview" || activeRail === "signals",
    showLogsPanel: activeRail === "overview" || activeRail === "systems",
  };
  const focusPanelCount = [visibility.showSteamPanel, visibility.showGatewayPanel, visibility.showCostPanel].filter(Boolean).length;
  const safeSignalLabels = Array.isArray(signalLabels) ? signalLabels : [];
  const safeStageMetrics = Array.isArray(stageMetrics) ? stageMetrics : [];
  const safeAssistantInsights = Array.isArray(assistantInsights) ? assistantInsights : [];
  const safeGpuUtilizationValues = Array.isArray(gpuUtilizationValues) ? gpuUtilizationValues : [];
  const safeVramPressureValues = Array.isArray(vramPressureValues) ? vramPressureValues : [];
  const safeThermalSignal = Array.isArray(thermalSignal) ? thermalSignal : [];
  const safeServiceEntries = Array.isArray(serviceEntries) ? serviceEntries : [];
  const focusGridClassName = [
    "focus-grid",
    focusPanelCount === 2 ? "focus-grid--dual" : "",
    focusPanelCount === 1 ? "focus-grid--single" : "",
  ].filter(Boolean).join(" ");
  const systemsGridClassName = [
    "operations-grid",
    "operations-grid--triple",
  ].join(" ");
  const utilitySectionCount = [visibility.showServiceHealthSection, visibility.showPowerTimelineSection].filter(Boolean).length;
  const utilityGridClassName = [
    "operations-grid",
    utilitySectionCount === 2 ? "operations-grid--dual" : "",
    utilitySectionCount === 1 ? "operations-grid--single" : "",
  ].filter(Boolean).join(" ");
  const modePolyline = buildPolyline(modeSignal);
  const cpuPolyline = buildPolyline(cpuSignal);
  const thermalPolyline = buildPolyline(thermalSignal);

  const viewModel: DashboardViewModel = {
    activeRail,
    status,
    steamStatus,
    steamReplay,
    powerHistory: safePowerHistory,
    powerStats,
    logEntries,
    logService,
    logLines,
    logQuery,
    logLevel,
    logSource,
    logTotal,
    logsUnavailable,
    config: configDraft,
    isSavingConfig,
    gatewayToken,
    notice,
    error,
    stressStatus,
    currentPageCopy,
    health,
    isWindows,
    estimatedSystemPower,
    totalGpuPower,
    cpuPowerLabel,
    queueLoad,
    memoryPercent,
    signalLabels: safeSignalLabels,
    modePolyline,
    cpuPolyline,
    thermalPolyline,
    thermalSignal: safeThermalSignal,
    gpuUtilizationValues: safeGpuUtilizationValues,
    vramPressureValues: safeVramPressureValues,
    stageMetrics: safeStageMetrics,
    assistantInsights: safeAssistantInsights,
    overviewStats,
    serviceEntries: safeServiceEntries,
    activeServiceCount,
    maxStorageUse,
    networkLoad,
    gpuMemoryPressure,
    coreBars,
    focusGridClassName,
    systemsGridClassName,
    utilityGridClassName,
    visibility,
  };

  const actions: DashboardActions = {
    navigateToPage,
    handleLogout,
    setGatewayToken,
    saveGatewayToken,
    setLogService,
    setLogLines,
    setLogQuery,
    setLogLevel,
    refreshLogs: () => {
      void loadLogs();
    },
    setConfig: (next: AppConfig) => {
      setConfigDraft(next);
    },
    saveConfig: saveSettingsConfig,
    restartService: (service: string) => api.restartService(service),
    runAction,
    confirmDangerousAction,
  };

  if (isLogin && !isBootstrapping) {
    return (
      <LoginView
        loginError={loginError}
        loginUser={loginUser}
        loginPass={loginPass}
        rememberMe={rememberMe}
        onLogin={handleLogin}
        onLoginUserChange={setLoginUser}
        onLoginPassChange={setLoginPass}
        onRememberMeChange={setRememberMe}
      />
    );
  }

  if (isBootstrapping || !status) {
    return <LoadingView message="로그인 후 대시보드 상태를 동기화하는 중입니다." />;
  }

  return (
    <DashboardErrorBoundary>
      <DashboardLayout
        viewModel={viewModel}
        actions={actions}
        formatTimestamp={fmtTs}
        formatNumber={fmtNumber}
      />
    </DashboardErrorBoundary>
  );
}
