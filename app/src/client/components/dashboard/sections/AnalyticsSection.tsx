import { MetricBar } from "../../MetricBar";
import { MiniChart } from "../../MiniChart";
import { ensureSeries } from "../constants";
import type { AssistantInsight, StageMetric } from "../types";

interface AnalyticsSectionProps {
  signalLabels: string[];
  modePolyline: string;
  cpuPolyline: string;
  thermalPolyline: string;
  stageMetrics: StageMetric[];
  cpuUsagePercent: number;
  memoryPercent: number;
  gpuMemoryPressure: number;
  queueLoad: number;
  lastUsedAt: number | null;
  idleRemainingSeconds: number;
  networkLoad: number;
  maxStorageUse: number;
  totalGpuPower: number;
  cpuPowerW: number;
  steamHealthLabel: string;
  gatewayEnabled: boolean;
  activeServiceCount: number;
  serviceCount: number;
  assistantInsights: AssistantInsight[];
  gpuUtilizationValues: number[];
  thermalSignal: number[];
  vramPressureValues: number[];
  gpuMemoryPressureFallback: number;
  formatTimestamp: (value: number | null | undefined) => string;
  formatNumber: (value: number, digits?: number) => string;
}

export function AnalyticsSection({
  signalLabels,
  modePolyline,
  cpuPolyline,
  thermalPolyline,
  stageMetrics,
  cpuUsagePercent,
  memoryPercent,
  gpuMemoryPressure,
  queueLoad,
  lastUsedAt,
  idleRemainingSeconds,
  networkLoad,
  maxStorageUse,
  totalGpuPower,
  cpuPowerW,
  steamHealthLabel,
  gatewayEnabled,
  activeServiceCount,
  serviceCount,
  assistantInsights,
  gpuUtilizationValues,
  thermalSignal,
  vramPressureValues,
  gpuMemoryPressureFallback,
  formatTimestamp,
  formatNumber,
}: AnalyticsSectionProps) {
  return (
    <section className="analytics-shell">
      <div className="analytics-layout analytics-layout--balanced">
        <article className="analytics-stage glass-card panel">
          <div className="panel__head analytics-stage__head">
            <div>
              <p className="eyebrow">Signal Matrix</p>
              <h2>Platform Signal Overview</h2>
            </div>
            <span className="pill pill--cyan">Live blend</span>
          </div>
          <div className="analytics-stage__legend">
            <span><i className="legend-dot legend-dot--violet" /> Mode orchestration</span>
            <span><i className="legend-dot legend-dot--cyan" /> CPU distribution</span>
            <span><i className="legend-dot legend-dot--amber" /> Thermal envelope</span>
          </div>
          <div className="signal-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="platform signal chart">
              <polyline className="signal-chart__gridline" points="0,20 100,20" />
              <polyline className="signal-chart__gridline" points="0,40 100,40" />
              <polyline className="signal-chart__gridline" points="0,60 100,60" />
              <polyline className="signal-chart__gridline" points="0,80 100,80" />
              <polyline className="signal-chart__line signal-chart__line--violet" points={modePolyline} />
              <polyline className="signal-chart__line signal-chart__line--cyan" points={cpuPolyline} />
              <polyline className="signal-chart__line signal-chart__line--amber" points={thermalPolyline} />
            </svg>
            <div className="signal-chart__labels">
              {signalLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
          <div className="analytics-stage__metrics">
            {stageMetrics.map((metric) => (
              <div className="signal-stat" key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <span>{metric.detail}</span>
              </div>
            ))}
          </div>
          <div className="analytics-stage__detail-grid">
            <div className="signal-stack">
              <MetricBar label="CPU Load" value={formatNumber(cpuUsagePercent, 0)} percent={cpuUsagePercent} tone="cyan" />
              <MetricBar label="Memory Pressure" value={formatNumber(memoryPercent, 0)} percent={memoryPercent} tone="violet" />
              <MetricBar label="VRAM Peak" value={formatNumber(gpuMemoryPressure, 0)} percent={gpuMemoryPressure} tone="amber" />
              <MetricBar label="Queue Backlog" value={`${queueLoad}`} percent={queueLoad * 10} tone={queueLoad > 0 ? "amber" : "green"} />
            </div>
            <div className="signal-stack signal-stack--compact">
              <div className="kv-list kv-list--compact">
                <span>Last activity</span><strong>{formatTimestamp(lastUsedAt)}</strong>
                <span>Gateway idle</span><strong>{idleRemainingSeconds}s</strong>
                <span>Network flow</span><strong>{formatNumber(networkLoad, 2)} MB/s</strong>
                <span>Storage peak</span><strong>{formatNumber(maxStorageUse, 0)}%</strong>
              </div>
              <div className="power-breakdown power-breakdown--stack power-breakdown--soft">
                <span><strong>{formatNumber(totalGpuPower, 1)} W</strong> GPU draw</span>
                <span><strong>{formatNumber(cpuPowerW, 1)} W</strong> CPU package</span>
              </div>
            </div>
          </div>
        </article>

        <article className="assistant-panel assistant-panel--expanded glass-card panel">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Mission Assistant</p>
              <h2>Operator Notes</h2>
            </div>
            <span className="pill pill--amber">AI Assist</span>
          </div>
          <div className="assistant-bubble assistant-bubble--roomy">
            운영 우선순위를 실시간 상태와 큐 흐름 기준으로 정리해 다음 액션을 빠르게 판단할 수 있게 합니다.
          </div>
          <div className="assistant-status-bar assistant-status-bar--roomy">
            <span><strong>Steam</strong>{steamHealthLabel}</span>
            <span><strong>Gateway</strong>{gatewayEnabled ? "ONLINE" : "PAUSED"}</span>
            <span><strong>Runtime</strong>{`${activeServiceCount}/${serviceCount || 1}`}</span>
          </div>
          <div className="assistant-orb assistant-orb--tall" aria-hidden="true">
            <span />
          </div>
          <div className="assistant-notes assistant-notes--dense">
            {assistantInsights.map((note) => (
              <div className={`assistant-note assistant-note--${note.tone}`} key={`${note.title}-${note.detail}`}>
                <strong>{note.title}</strong>
                <p>{note.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="analytics-mini-grid analytics-mini-grid--below">
        <MiniChart label="GPU Load Mix" unit="%" values={ensureSeries(gpuUtilizationValues, cpuUsagePercent)} accent="#7c3aed" max={100} />
        <MiniChart label="Thermal Drift" unit="°" values={thermalSignal} accent="#7dd3fc" max={100} />
        <MiniChart label="VRAM Pressure" unit="%" values={ensureSeries(vramPressureValues, gpuMemoryPressureFallback)} accent="#ffcb6b" max={100} />
      </div>
    </section>
  );
}
