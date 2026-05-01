import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { clampPercent, fmtNumber, fmtTs } from "./lib/format";
import { MetricBar } from "./components/MetricBar";
import { MiniChart } from "./components/MiniChart";
import type { GpuStatus, PowerMode, SystemMetrics, SystemStatus, PowerStats } from "../shared/types";
import "./styles.css";

const modeList: PowerMode[] = ["LOW_POWER", "STANDARD_250", "STANDARD_280", "TURBO", "ADAPTIVE"];
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
  const [gpuMetrics, setGpuMetrics] = useState<Array<GpuStatus & { timestamp: number }>>([]);
  const [systemMetrics, setSystemMetrics] = useState<Array<SystemMetrics & { timestamp: number }>>([]);
  const [powerHistory, setPowerHistory] = useState<Array<{ mode: PowerMode; timestamp: number }>>([]);
  const [powerStats, setPowerStats] = useState<PowerStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logService, setLogService] = useState(services[0]);
  const [logLines, setLogLines] = useState(80);
  const [akInterval, setAkInterval] = useState(4);
  const [adminToken, setAdminToken] = useState(() => api.getAdminToken());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    const next = await api.status();
    setStatus(next);
    setAkInterval(next.ak620.refreshIntervalSeconds);
  }

  async function refreshTelemetry() {
    const [gpu, system, history, stats] = await Promise.all([
      api.gpuMetrics(),
      api.systemMetrics(),
      api.powerHistory(),
      api.powerStats(),
    ]);
    setGpuMetrics(gpu.metrics);
    setSystemMetrics(system.metrics);
    setPowerHistory([...history.history].reverse());
    setPowerStats(stats);
  }

  async function loadLogs() {
    const data = await api.logs(logService, logLines);
    setLogs(data.lines);
  }

  function saveAdminToken() {
    api.setAdminToken(adminToken);
    setNotice(adminToken.trim() ? "Admin token을 저장했습니다." : "Admin token을 삭제했습니다.");
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
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(telemetryTimer);
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
  const maxGpuTemp = useMemo(() => Math.max(0, ...(status?.gpus ?? []).map((gpu) => gpu.temperatureC)), [status]);
  const memoryPercent = status && status.system.memoryTotalGb > 0
    ? (status.system.memoryUsedGb / status.system.memoryTotalGb) * 100
    : 0;
  const gpu0Metrics = gpuMetrics.filter((metric) => metric.index === 0);
  const health = getHealth(status ?? undefined);

  return (
    <main className="dashboard-shell">
      <div className="aurora aurora--one" />
      <div className="aurora aurora--two" />

      <header className="hero glass-card">
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

      {(error || notice || (status?.alerts.length ?? 0) > 0) && (
        <section className="alert-rail">
          {error && <div className="alert-card alert-card--bad">{error}</div>}
          {notice && <div className="alert-card alert-card--ok">{notice}</div>}
          {status?.alerts.map((alert) => <div className="alert-card alert-card--bad" key={alert}>{alert}</div>)}
        </section>
      )}

      <section className="summary-grid">
        <div className="stat-card glass-card">
          <span>Estimated Cost</span>
          <strong>{fmtNumber(powerStats?.cost ?? 0, 0)} 원</strong>
          <small>{fmtNumber(powerStats?.totalKwh ?? 0, 1)} kWh 이달 누적</small>
        </div>
        <div className="stat-card glass-card">
          <span>Estimated System Power</span>
          <strong>{fmtNumber(estimatedSystemPower, 1)} W</strong>
          <small>GPU + CPU package + base estimate</small>
        </div>
        <div className="stat-card glass-card">
          <span>Total GPU Power</span>
          <strong>{fmtNumber(totalGpuPower, 1)} W</strong>
          <small>Limit-aware live draw</small>
        </div>
        <div className="stat-card glass-card">
          <span>Max GPU Temp</span>
          <strong>{maxGpuTemp} °C</strong>
          <small>Alert threshold protected</small>
        </div>
        <div className="stat-card glass-card">
          <span>CPU Usage</span>
          <strong>{status?.system.cpuUsagePercent ?? 0}%</strong>
          <small>{status?.system.cpuClockMhz ?? 0} MHz average clock</small>
        </div>
        <div className="stat-card glass-card">
          <span>RAM Usage</span>
          <strong>{fmtNumber(status?.system.memoryUsedGb ?? 0, 1)} GB</strong>
          <small>{fmtNumber(status?.system.memoryTotalGb ?? 0, 1)} GB installed</small>
        </div>
      </section>

      <section className="chart-grid">
        <MiniChart label="System Power" unit="W" values={systemMetrics.map((metric) => metric.estimatedSystemPowerW ?? metric.basePowerEstimateW)} accent="#38bdf8" />
        <MiniChart label="GPU0 Power" unit="W" values={gpu0Metrics.map((metric) => metric.powerW)} accent="#38bdf8" />
        <MiniChart label="GPU0 Temp" unit="°C" values={gpu0Metrics.map((metric) => metric.temperatureC)} accent="#f59e0b" max={100} />
        <MiniChart label="CPU Load" unit="%" values={systemMetrics.map((metric) => metric.cpuUsagePercent)} accent="#22c55e" max={100} />
        <MiniChart label="RAM Used" unit="GB" values={systemMetrics.map((metric) => metric.memoryUsedGb)} accent="#fb7185" />
      </section>

      <section className="control-grid">
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
              <p className="eyebrow">Admin Access</p>
              <h2>Secure Actions</h2>
            </div>
            <span className={`pill ${adminToken.trim() ? "pill--green" : "pill--amber"}`}>{adminToken.trim() ? "Token set" : "Token required"}</span>
          </div>
          <div className="token-box">
            <input
              type="password"
              value={adminToken}
              placeholder="VANTAGE_ADMIN_TOKEN"
              onChange={(event) => setAdminToken(event.target.value)}
            />
            <button onClick={saveAdminToken}>Save Token</button>
          </div>
          <p className="muted-copy">전원/LLM/로그 API는 저장된 admin token을 Bearer token으로 전송합니다.</p>
          <div className="danger-zone">
            <button onClick={() => void confirmDangerousAction("서버를 재부팅할까요? 모든 서비스가 중단됩니다.", api.reboot, "Reboot 명령을 전송했습니다.")}>Restart System</button>
            <button onClick={() => void confirmDangerousAction("서버를 종료할까요? 원격 접속이 끊깁니다.", api.shutdown, "Shutdown 명령을 전송했습니다.")}>Shutdown</button>
          </div>
        </article>
      </section>

      <section className="control-grid">
        <article className="glass-card panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">LLM Gateway</p>
              <h2>{status?.llmReady ? "vLLM Running" : "vLLM Standby"}</h2>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(status?.gateway.enabled)}
                onChange={(event) => void runAction(() => api.setGatewayEnabled(event.target.checked), "Gateway 설정을 변경했습니다.")}
              />
              <span />
            </label>
          </div>
          <div className="kv-list">
            <span>Upstream</span><strong>{status?.gateway.upstreamUrl ?? "-"}</strong>
            <span>Port</span><strong>{status?.gateway.listenPort ?? "-"}</strong>
            <span>Idle Remaining</span><strong>{status?.gateway.idleRemainingSeconds ?? 0}s</strong>
            <span>Last Request</span><strong>{fmtTs(status?.gateway.lastUsedAt)}</strong>
          </div>
          <div className="button-row">
            <button onClick={() => void runAction(api.startLlm, "vLLM 시작 명령을 전송했습니다.")}>Start</button>
            <button onClick={() => void runAction(api.stopLlm, "vLLM 중지 명령을 전송했습니다.")}>Stop</button>
            <button onClick={() => void runAction(api.touchLlm, "LLM activity를 갱신했습니다.")}>Touch</button>
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
          <div className="panel__head"><h2>System Core</h2><span className="pill pill--green">{status?.system.cpuCoresUsagePercent.length ?? 0} cores</span></div>
          <MetricBar label="CPU" value={status?.system.cpuUsagePercent ?? 0} detail={cpuPowerLabel} tone="green" />
          <MetricBar label="RAM" value={memoryPercent} detail={`${fmtNumber(status?.system.memoryUsedGb ?? 0, 1)} / ${fmtNumber(status?.system.memoryTotalGb ?? 0, 1)} GB`} tone={memoryPercent > 85 ? "red" : "amber"} />
          <div className="power-breakdown">
            <span><strong>{fmtNumber(totalGpuPower, 1)} W</strong> GPU</span>
            <span><strong>{status?.system.cpuPowerW === null || status?.system.cpuPowerW === undefined ? "N/A" : `${fmtNumber(status.system.cpuPowerW, 1)} W`}</strong> CPU</span>
            <span><strong>{fmtNumber(status?.system.basePowerEstimateW ?? 0, 1)} W</strong> base</span>
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
          <div className="panel__head"><h2>AK620 Display</h2><span className={`pill ${status?.ak620.connected ? "pill--green" : "pill--red"}`}>{status?.ak620.connected ? "Connected" : "Offline"}</span></div>
          <div className="ak-dial"><span>{status?.ak620.temperatureC ?? 0}°</span><small>{status?.ak620.currentTarget ?? "GPU0"}</small></div>
          <label className="range-label">Refresh interval <strong>{akInterval}s</strong></label>
          <input
            className="range"
            type="range"
            min={status?.ak620.minRefreshInterval ?? 1}
            max={status?.ak620.maxRefreshInterval ?? 60}
            value={akInterval}
            onChange={(event) => setAkInterval(Number(event.target.value))}
          />
          <button onClick={() => void runAction(() => api.saveAk620Interval(akInterval), "AK620 refresh interval을 저장했습니다.")}>Apply Interval</button>
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
