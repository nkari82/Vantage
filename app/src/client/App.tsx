import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { clampPercent, fmtNumber, fmtTs } from "./lib/format";
import { MetricBar } from "./components/MetricBar";
import type { PowerMode, SystemStatus, PowerStats } from "../shared/types";
import "./styles.css";

const modeList: PowerMode[] = ["DEFAULT", "LOW_POWER", "STANDARD_250", "STANDARD_280", "TURBO", "ADAPTIVE"];
const services = [
  "vantage-backend.service",
  "vantage-llm-gateway.service",
  "vllm-coder.service",
  "vantage-ak620-agent.service",
];

function serviceLabel(name: string): string {
  return name.replace(".service", "").replace("vantage-", "");
}

function getHealth(status?: SystemStatus): "ok" | "warn" | "bad" {
  if (!status) return "warn";
  if (status.alerts.length > 0 || status.system.degraded) return "bad";
  const inactive = Object.values(status.system.serviceStatus).filter((value) => value !== "active").length;
  return inactive > 0 ? "warn" : "ok";
}

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [powerHistory, setPowerHistory] = useState<Array<{ mode: PowerMode; timestamp: number }>>([]);
  const [powerStats, setPowerStats] = useState<PowerStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logService, setLogService] = useState(services[0]);
  const [logLines, setLogLines] = useState(80);
  const [akInterval, setAkInterval] = useState(4);
  const [isLogin, setIsLogin] = useState(() => !api.getAdminToken());
  const [gatewayToken, setGatewayToken] = useState(() => api.getAdminToken());
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stressStatus, setStressStatus] = useState<{
    isTesting: boolean;
    currentTest?: 'cpu' | 'memory';
    lastError?: string;
    lastFinishedAt?: number;
  } | null>(null);

  async function refreshStatus() {
    const next = await api.status();
    setStatus(next);
    setAkInterval(next.ak620.refreshIntervalSeconds);
  }

  async function refreshTelemetry() {
    const [history, stats] = await Promise.all([
      api.powerHistory(),
      api.powerStats(),
    ]);
    setPowerHistory([...history.history].reverse());
    setPowerStats(stats);
  }

  async function loadLogs() {
    const data = await api.logs(logService, logLines);
    setLogs(data.lines);
  }
  
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await api.login(loginUser, loginPass);
      api.setAdminToken(data.token, rememberMe);
      setGatewayToken(data.token);
      setIsLogin(false);
      setLoginError(null);
      setNotice("로그인했습니다.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setLoginError(message === "Invalid credentials" ? "잘못된 사용자 이름 또는 비밀번호입니다." : message);
    }
  }

  function handleLogout() {
    api.setAdminToken("");
    setGatewayToken("");
    setIsLogin(true);
    setLoginUser("");
    setLoginPass("");
    setNotice("로그아웃했습니다.");
  }

  function saveGatewayToken() {
    setGatewayToken(gatewayToken.trim() || "x");
    api.setAdminToken(gatewayToken.trim() || "x", true);
    setNotice((gatewayToken.trim() || "x") ? "LLM Gateway token을 저장했습니다." : "LLM Gateway token을 삭제했습니다.");
  }

  async function confirmDangerousAction(message: string, action: () => Promise<unknown>, success: string) {
    if (!window.confirm(message)) {
      return;
    }

    await runAction(action, success);
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

  const totalGpuPower = useMemo(() => (status?.gpus ?? []).reduce((acc, gpu) => acc + gpu.powerW, 0), [status]);
  const estimatedSystemPower = status?.system.estimatedSystemPowerW ?? totalGpuPower;
  const cpuPowerLabel = status?.system.cpuPowerW === null || status?.system.cpuPowerW === undefined
    ? "CPU RAPL unavailable"
    : `CPU ${fmtNumber(status.system.cpuPowerW, 1)} W`;
  const isWindows = status?.system.os.platform === "win32";
  const health = getHealth(status ?? undefined);

  if (isLogin) {
    return (
      <main className="dashboard-shell">
        <div className="aurora aurora--one" />
        <div className="aurora aurora--two" />
        <div className="login-container glass-card">
          <div className="login-header">
            <p className="eyebrow">Vantage Control Plane</p>
            <h1>로그인</h1>
            <p className="hero__copy">대시보드에 접속하려면 로그인하세요.</p>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            {loginError && <div className="alert-card alert-card--bad">{loginError}</div>}
            <div className="form-group">
              <label htmlFor="username">사용자 이름</label>
                <input
                id="username"
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="ID"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">비밀번호</label>
              <input
                id="password"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Password"
              />
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>로그인 유지 (Remember me)</span>
              </label>
            </div>
            <button type="submit" className="login-button">로그인</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />

      <header className="hero glass-card">
        {!isLogin && (
          <button className="logout-button" onClick={handleLogout} title="로그아웃">
            로그아웃
          </button>
        )}
        <div>
          <p className="eyebrow">Vantage Control Plane</p>
          <h1>Dual RTX 3090 Telemetry Cockpit</h1>
          <p className="hero__copy">저전력 홈서버와 고성능 LLM 서버 사이를 실시간으로 관제하고 전환합니다.</p>
        </div>
        <div className={`system-orb system-orb--${health}`}>
          <span>{health.toUpperCase()}</span>
          <strong>{status?.mode ?? "CONNECTING"}</strong>
        </div>
      </header>

      {(error || notice || (status?.alerts.length ?? 0) > 0 || isWindows) && (
        <section className="alert-rail">
          {error && <div className="alert-card alert-card--bad">{error}</div>}
          {notice && <div className="alert-card alert-card--ok">{notice}</div>}
          {status?.alerts.map((alert) => <div className="alert-card alert-card--bad" key={alert}>{alert}</div>)}
          {isWindows && (
            <div className="alert-card alert-card--warn">
              Windows 환경에서는 nvidia-smi, systemd 서비스等功能이 제한됩니다. GPU 데이터와 서비스 상태가 표시되지 않을 수 있습니다.
            </div>
          )}
        </section>
      )}

      <section className="summary-grid">
      </section>
      
      <section className="control-grid" style={{ gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
        <article className="glass-card panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Electricity Cost</p>
              <h2>이번 달 예상 요금</h2>
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "var(--accent-cyan)" }}>
              {fmtNumber(powerStats?.cost ?? 0, 0)} <small style={{ fontSize: "1rem" }}>원</small>
            </div>
            <div style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {fmtNumber(powerStats?.totalKwh ?? 0, 1)} kWh
            </div>
            <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              시스템 가동 시간 기준
            </div>
          </div>
        </article>

        <article className="glass-card panel panel--wide">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Power Metrics</p>
              <h2>System Power Breakdown</h2>
            </div>
          </div>
          <div className="power-breakdown">
            <span><strong>{fmtNumber(estimatedSystemPower, 1)} W</strong> System</span>
            <span><strong>{fmtNumber(totalGpuPower, 1)} W</strong> GPU</span>
            <span><strong>{cpuPowerLabel}</strong> CPU</span>
            <span><strong>{fmtNumber(status?.system.basePowerEstimateW ?? 0, 1)} W</strong> base</span>
          </div>
        </article>
      </section>

<section className="control-grid control-grid--three">
        <article className="glass-card panel panel--wide">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Power Profile</p>
              <h2>Mode Control</h2>
            </div>
            <span className="pill pill--cyan">{status?.mode ?? "-"}</span>
          </div>
          <div className="mode-grid">
            {modeList.map((mode) => (
              <button
                className={`mode-button ${status?.mode === mode ? "mode-button--active" : ""}`}
                key={mode}
                onClick={() => void runAction(() => api.setMode(mode), `${mode} 모드로 전환했습니다.`)}
              >
                <span>{mode.replace("STANDARD_", "STD ")}</span>
                <small>{mode === "TURBO" ? "Manual burst" : mode === "ADAPTIVE" ? "Auto idle" : "Power capped"}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="glass-card panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">LLM Gateway</p>
              <h2>Gateway Control</h2>
            </div>
            <span className={`pill ${status?.llmGatewayEnabled ? "pill--green" : "pill--red"}`}>
              {status?.llmGatewayEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="kv-list">
            <span>Ready</span><strong>{status?.llmReady ? "Yes" : "No"}</strong>
            <span>Upstream</span><strong>{status?.gateway.upstreamUrl ?? "-"}</strong>
            <span>Listen</span><strong>{status?.gateway.listenPort ?? "-"}</strong>
            <span>Idle Timeout</span><strong>{status?.gateway.idleTimeoutMinutes ?? "-"} min</strong>
          </div>
          <div className="token-box">
            <input
              type="text"
              value={gatewayToken}
              onChange={(event) => setGatewayToken(event.target.value)}
              placeholder="x"
            />
            <button onClick={saveGatewayToken}>Save Token</button>
          </div>
          <p className="muted-copy">LLM Gateway 기본 토큰은 x이며, 필요하면 여기서 덮어쓸 수 있습니다.</p>
          <div className="button-row">
            <button onClick={() => void runAction(() => api.setGatewayEnabled(!(status?.llmGatewayEnabled ?? false)), status?.llmGatewayEnabled ? "LLM Gateway를 비활성화했습니다." : "LLM Gateway를 활성화했습니다.")}>{status?.llmGatewayEnabled ? "Disable Gateway" : "Enable Gateway"}</button>
            <button onClick={() => void runAction(() => api.touchLlm(), "LLM Gateway keepalive를 전송했습니다.")}>Touch</button>
            <button onClick={() => void runAction(() => api.startLlm(), "vLLM 시작 명령을 전송했습니다.")}>Start vLLM</button>
            <button onClick={() => void runAction(() => api.stopLlm(), "vLLM 중지 명령을 전송했습니다.")}>Stop vLLM</button>
          </div>
        </article>

        <article className="glass-card panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Admin Access</p>
              <h2>Secure Actions</h2>
            </div>
            <span className="pill pill--green">Login active</span>
          </div>
          <p className="muted-copy">로그인 후 보호된 작업은 내부적으로 인증되어 전송됩니다.</p>
          <div className="danger-zone">
            <button onClick={() => void confirmDangerousAction("서버를 재부팅할까요? 모든 서비스가 중단됩니다.", api.reboot, "Reboot 명령을 전송했습니다.")}>Restart System</button>
            <button onClick={() => void confirmDangerousAction("서버를 종료할까요? 원격 접속이 끊깁니다.", api.shutdown, "Shutdown 명령을 전송했습니다.")}>Shutdown</button>
            <button onClick={() => void runAction(() => api.testCpu(60), "CPU 스트레스 테스트 시작 (60s)")}>CPU Stress Test</button>
            <button onClick={() => void runAction(() => api.testMemory(60), "RAM 스트레스 테스트 시작 (60s)")}>RAM Stress Test</button>
            {stressStatus?.isTesting && (
              <div className="stress-status">
                <span className="stress-indicator" /> {stressStatus.currentTest?.toUpperCase()} 테스트 실행 중...
              </div>
            )}
            {stressStatus?.lastError && (
              <div className="stress-error">테스트 오류: {stressStatus.lastError}</div>
            )}
          </div>
        </article>
      </section>

      <section className="control-grid control-grid--three">
        <article className="glass-card panel">
          <div className="panel__head"><h2>GPU Fleet</h2><span className="pill pill--cyan">{status?.gpus.length ?? 0} cards</span></div>
          <div className="stack">
            {(status?.gpus ?? []).map((gpu) => {
              const memPct = gpu.memoryTotalMiB > 0 ? (gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100 : 0;
              return (
                <div className="gpu-card" key={gpu.index}>
                  <div className="gpu-card__top"><strong>GPU{gpu.index}</strong><span>{gpu.temperatureC}°C · {gpu.powerW}W</span></div>
                  <MetricBar label="Utilization" value={gpu.utilization} tone="cyan" />
                  <MetricBar label="VRAM" value={memPct} detail={`${gpu.memoryUsedMiB} / ${gpu.memoryTotalMiB} MiB`} tone="green" />
                </div>
              );
            })}
            {status?.gpus.length === 0 && <p className="empty">GPU 데이터 없음 - nvidia-smi 상태를 확인하세요.</p>}
          </div>
        </article>

        <article className="glass-card panel">
          {!status?.system && <p className="empty">시스템 데이터를 불러올 수 없습니다. systeminformation 라이브러리를 확인하세요.</p>}
          <div className="panel__head"><h2>System Core</h2><span className="pill pill--green">{status?.system.cpuCoresUsagePercent.length ?? 0} cores</span></div>
          <div className="memory-details">
            <small>Installed: {status?.system.memoryInstalledGb ?? 0} GB</small>
            <small>Speed: {status?.system.memoryClockMhz ?? 0} MHz</small>
          </div>
          <div className="core-grid">
            {(status?.system.cpuCoresUsagePercent ?? []).map((usage, index) => (
              <span key={`${index}-${usage}`} style={{ height: `${Math.max(8, clampPercent(usage))}%` }} title={`Core ${index}: ${usage}%`} />
            ))}
          </div>
          <div className="temp-cloud">
            {Object.entries(status?.system.temperatures ?? {}).slice(0, 8).map(([name, value]) => (
              <span key={name}>{name.replace(/_/g, " ")} <strong>{value}°C</strong></span>
            ))}
          </div>
        </article>

        <article className="glass-card panel">
          <div className="panel__head"><h2>System Resources</h2></div>
          <div className="kv-list">
            <span>OS</span><strong>{status?.system.os.distro ?? "unknown"}</strong>
            <span>Kernel</span><strong>{status?.system.os.kernel ?? "unknown"}</strong>
            <span>Uptime</span><strong>{Math.floor((status?.system.os.uptime ?? 0) / 3600)}h</strong>
          </div>
          <div className="stack">
            {status?.system.storage.map(s => (
                <div key={s.mount}>
                    <div className="metric-bar__label"><span>{s.mount}</span><strong>{s.usePercent}%</strong></div>
                    <MetricBar label={s.mount} value={s.usePercent} detail={`${s.usedGb}/${s.sizeGb} GB`} tone="cyan" />
                </div>
            ))}
          </div>
        </article>
      </section>

      <section className="control-grid">
        <article className="glass-card panel">
          <div className="panel__head"><h2>Service Health</h2><span className="pill pill--cyan">systemd</span></div>
          <div className="service-grid">
            {Object.entries(status?.system.serviceStatus ?? {}).map(([name, value]) => (
              <div className={`service-chip service-chip--${value === "active" ? "ok" : "bad"}`} key={name}>
                <span />
                <strong>{serviceLabel(name)}</strong>
                <small>{value}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card panel">
          <div className="panel__head"><h2>Power Timeline</h2><span className="pill pill--amber">latest first</span></div>
          <div className="timeline">
            {powerHistory.length === 0 && <p className="empty">모드 변경 기록이 없습니다. 모드를 변경하면 타임라인이 표시됩니다.</p>}
            {powerHistory.map((entry) => (
              <div className="timeline__item" key={`${entry.mode}-${entry.timestamp}`}>
                <span />
                <strong>{entry.mode}</strong>
                <small>{fmtTs(entry.timestamp)}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="glass-card panel logs-panel">
        <div className="panel__head">
          <div><p className="eyebrow">Journal Tail</p><h2>System Logs</h2></div>
          <div className="log-controls">
            <select value={logService} onChange={(event) => setLogService(event.target.value)}>
              {services.map((service) => <option key={service}>{service}</option>)}
            </select>
            <input type="number" min={20} max={300} value={logLines} onChange={(event) => setLogLines(Number(event.target.value))} />
            <button onClick={() => void loadLogs()}>Refresh</button>
          </div>
        </div>
        <pre>{logs.length > 0 ? logs.join("\n") : "loading logs..."}</pre>
      </section>
    </main>
  );
}
