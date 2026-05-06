import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
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

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [steamStatus, setSteamStatus] = useState<SteamSessionStatusResponse | null>(null);
  const [steamReplay, setSteamReplay] = useState<SteamReplayStatusResponse | null>(null);
  const [powerHistory, setPowerHistory] = useState<Array<{ mode: PowerMode; timestamp: number }>>([]);
  const [powerStats, setPowerStats] = useState<PowerStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logService, setLogService] = useState<string>(services[0]);
  const [logLines, setLogLines] = useState(80);
  const [isLogin, setIsLogin] = useState(() => !api.getAdminToken());
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
    setLogs([loginRequiredLogsMessage]);

    if (sessionExpired) {
      api.setAdminToken("");
      setIsLogin(true);
      setLoginUser("");
      setLoginPass("");
      setLoginError("세션이 만료되었거나 인증 상태가 올바르지 않습니다. 다시 로그인해 주세요.");
      setNotice(null);
    }
  }

  async function refreshStatus() {
    const nextStatus = await api.status();
    setStatus(nextStatus);

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
      setLogs([loginRequiredLogsMessage]);
      return;
    }

    try {
      const data = await api.logs(logService, logLines);
      setLogs(data.lines);
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그를 불러오지 못했습니다.";
      if (isProtectedRouteFailure(message)) {
        clearProtectedState(true);
        return;
      }
      setLogs([message]);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await api.login(loginUser, loginPass);
      api.setAdminToken(data.token, rememberMe);
      setIsLogin(false);
      setLoginError(null);
      setNotice("로그인했습니다.");
      await Promise.all([
        refreshStatus(),
        refreshTelemetry(),
        loadLogs(),
        api.stressStatus().then(setStressStatus),
      ]);
    } catch (err) {
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
    setLogs([loginRequiredLogsMessage]);
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
    void refreshStatus().catch((err: unknown) => setError(err instanceof Error ? err.message : "상태 로드 실패"));
    void refreshTelemetry().catch(() => undefined);
    void loadLogs().catch(() => undefined);

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
  }, [logService, logLines]);

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

  const totalGpuPower = useMemo(() => (status?.gpus ?? []).reduce((acc, gpu) => acc + gpu.powerW, 0), [status]);
  const estimatedSystemPower = status?.system.estimatedSystemPowerW ?? totalGpuPower;
  const cpuPowerLabel = status?.system.cpuPowerW === null || status?.system.cpuPowerW === undefined
    ? "CPU RAPL unavailable"
    : `CPU ${fmtNumber(status.system.cpuPowerW, 1)} W`;
  const isWindows = status?.system.os.platform === "win32";
  const health = getHealth(status ?? undefined);
  const steamCounts = steamStatus?.queueSummary ?? status?.queueSummary ?? { queued: 0, processing: 0, completed: 0, failed: 0 };
  const queueLoad = steamCounts.queued + steamCounts.processing;
  const memoryPercent = status?.system.memoryTotalGb
    ? (status.system.memoryUsedGb / status.system.memoryTotalGb) * 100
    : 0;
  const avgGpuTemp = status?.gpus.length
    ? status.gpus.reduce((acc, gpu) => acc + gpu.temperatureC, 0) / status.gpus.length
    : 0;
  const coreBars = useMemo(
    () => (status?.system.cpuCoresUsagePercent ?? []).map((usage) => ({
      usage,
      style: { "--core-height": `${Math.max(8, clampPercent(usage))}%` } as CSSProperties,
    })),
    [status?.system.cpuCoresUsagePercent],
  );
  const modeSignal = useMemo(() => {
    const recent = powerHistory.slice(0, 8).reverse().map((entry) => modeLevel(entry.mode));
    return recent.length > 0 ? recent : [modeLevel(status?.mode ?? "DEFAULT")];
  }, [powerHistory, status?.mode]);
  const cpuSignal = useMemo(() => {
    const series = (status?.system.cpuCoresUsagePercent ?? []).slice(0, 8).filter((value) => Number.isFinite(value));
    const fallback = status?.system.cpuUsagePercent ?? 0;
    const nextSeries = series.length > 0 ? [...series] : [fallback];
    while (nextSeries.length < 6) {
      nextSeries.unshift(nextSeries[0]);
    }
    return nextSeries.slice(-8);
  }, [status?.system.cpuCoresUsagePercent, status?.system.cpuUsagePercent]);
  const thermalSignal = useMemo(() => {
    const primaryTemps = Object.values(status?.system.temperatures ?? {}).slice(0, 8);
    const fallbackTemps = (status?.gpus ?? []).map((gpu) => gpu.temperatureC).slice(0, 8);
    const series = (primaryTemps.length > 0 ? primaryTemps : fallbackTemps).filter((value) => Number.isFinite(value));
    const nextSeries = series.length > 0 ? [...series] : [avgGpuTemp];
    while (nextSeries.length < 6) {
      nextSeries.unshift(nextSeries[0]);
    }
    return nextSeries.slice(-8);
  }, [status?.system.temperatures, status?.gpus, avgGpuTemp]);
  const signalLabels = useMemo(() => Array.from({ length: modeSignal.length }, (_, index) => `S${index + 1}`), [modeSignal.length]);
  const serviceEntries = Object.entries(status?.system.serviceStatus ?? {});
  const activeServiceCount = serviceEntries.filter(([, value]) => value === "active").length;
  const maxStorageUse = Math.max(0, ...(status?.system.storage ?? []).map((disk) => disk.usePercent));
  const networkLoad = (status?.system.network ?? []).reduce((acc, item) => acc + item.rxSec + item.txSec, 0) / 1024 / 1024;
  const gpuMemoryPressure = Math.max(0, ...(status?.gpus ?? []).map((gpu) => (gpu.memoryUsedMiB / Math.max(gpu.memoryTotalMiB, 1)) * 100));
  const gpuUtilizationValues = useMemo(() => (status?.gpus ?? []).map((gpu) => gpu.utilization), [status?.gpus]);
  const vramPressureValues = useMemo(
    () => (status?.gpus ?? []).map((gpu) => (gpu.memoryUsedMiB / Math.max(gpu.memoryTotalMiB, 1)) * 100),
    [status?.gpus],
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

    if (status.alerts.length > 0) {
      notes.push({ title: "Alerts", detail: `활성 알림 ${status.alerts.length}건을 먼저 확인하세요.`, tone: "hot" });
    }

    if (notes.length === 0) {
      notes.push({ title: "Stable", detail: "현재 시스템은 안정 상태입니다. 모드와 Gateway 상태를 기준으로 운영하면 됩니다.", tone: "ok" });
      notes.push({ title: "Power", detail: `예상 시스템 전력은 약 ${fmtNumber(estimatedSystemPower, 0)}W 입니다.`, tone: "info" });
    }

    return notes.slice(0, 4);
  }, [estimatedSystemPower, status, steamStatus, stressStatus]);
  const stageMetrics = useMemo(() => ([
    { label: "Service Health", value: `${activeServiceCount}/${serviceEntries.length || 1}`, detail: "active runtime services" },
    { label: "Memory Pressure", value: `${fmtNumber(memoryPercent, 0)}%`, detail: `${fmtNumber(status?.system.memoryUsedGb ?? 0, 1)} / ${fmtNumber(status?.system.memoryTotalGb ?? 0, 1)} GB` },
    { label: "VRAM Pressure", value: `${fmtNumber(gpuMemoryPressure, 0)}%`, detail: "peak GPU memory occupancy" },
    { label: "Network Flow", value: `${fmtNumber(networkLoad, 2)} MB/s`, detail: `storage peak ${fmtNumber(maxStorageUse, 0)}%` },
  ]), [activeServiceCount, gpuMemoryPressure, maxStorageUse, memoryPercent, networkLoad, serviceEntries.length, status?.system.memoryTotalGb, status?.system.memoryUsedGb]);
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
      delta: `${status?.gateway.listenPort ?? "-"} port`,
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
    powerHistory,
    powerStats,
    logs,
    logService,
    logLines,
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
    signalLabels,
    modePolyline,
    cpuPolyline,
    thermalPolyline,
    thermalSignal,
    gpuUtilizationValues,
    vramPressureValues,
    stageMetrics,
    assistantInsights,
    overviewStats,
    serviceEntries,
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
    refreshLogs: () => {
      void loadLogs();
    },
    runAction,
    confirmDangerousAction,
  };

  if (isLogin) {
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

  return (
    <DashboardLayout
      viewModel={viewModel}
      actions={actions}
      formatTimestamp={fmtTs}
      formatNumber={fmtNumber}
    />
  );
}
