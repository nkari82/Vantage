import { MetricBar } from "../../MetricBar";
import type { CoreBarDatum } from "../types";
import type { SystemStatus } from "../../../../shared/types";

interface SystemsSectionProps {
  className: string;
  status: SystemStatus | null;
  coreBars: CoreBarDatum[];
  memoryPercent: number;
  formatNumber: (value: number, digits?: number) => string;
}

export function SystemsSection({ className, status, coreBars, memoryPercent, formatNumber }: SystemsSectionProps) {
  const system = status?.system;
  const gpus = status?.gpus ?? [];

  return (
    <section className={className}>
      <article className="glass-card panel panel--section systems-grid__primary">
        <div className="panel__head"><h2>GPU Fleet</h2><span className="pill pill--cyan">{gpus.length} cards</span></div>
        <div className="stack">
          {gpus.map((gpu) => {
            const memPct = gpu.memoryTotalMiB > 0 ? (gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100 : 0;
            return (
              <div className="gpu-card" key={gpu.index}>
                <div className="gpu-card__top"><strong>GPU{gpu.index}</strong><span>{gpu.temperatureC}°C · {gpu.powerW}W</span></div>
                <MetricBar label="Utilization" value={gpu.utilization} tone="cyan" />
                <MetricBar label="VRAM" value={memPct} detail={`${gpu.memoryUsedMiB} / ${gpu.memoryTotalMiB} MiB`} tone="green" />
              </div>
            );
          })}
          {gpus.length === 0 && <p className="empty">GPU 데이터 없음 - nvidia-smi 상태를 확인하세요.</p>}
        </div>
      </article>

      <article className="glass-card panel panel--section systems-grid__secondary">
        {!system && <p className="empty">시스템 데이터를 불러올 수 없습니다. systeminformation 라이브러리를 확인하세요.</p>}
        <div className="panel__head"><h2>System Core</h2><span className="pill pill--green">{system?.cpuCoresUsagePercent?.length ?? 0} cores</span></div>
        <div className="memory-details">
          <small>Installed: {system?.memoryInstalledGb ?? 0} GB</small>
          <small>Speed: {system?.memoryClockMhz ?? 0} MHz</small>
        </div>
        <div className="core-grid">
          {coreBars.map(({ usage, style }, index) => (
            <span key={`${index}-${usage}`} style={style} title={`Core ${index}: ${usage}%`} />
          ))}
        </div>
        <MetricBar label="Memory Pressure" value={memoryPercent} detail={`${formatNumber(system?.memoryUsedGb ?? 0, 1)} / ${formatNumber(system?.memoryTotalGb ?? 0, 1)} GB`} tone="amber" />
        <div className="temp-cloud">
          {Object.entries(system?.temperatures ?? {}).slice(0, 8).map(([name, value]) => (
            <span key={name}>{name.replace(/_/g, " ")} <strong>{value}°C</strong></span>
          ))}
        </div>
      </article>

      <article className="glass-card panel panel--section systems-grid__tertiary">
        <div className="panel__head"><h2>System Resources</h2></div>
        <div className="kv-list">
          <span>OS</span><strong>{system?.os?.distro ?? "unknown"}</strong>
          <span>Kernel</span><strong>{system?.os?.kernel ?? "unknown"}</strong>
          <span>Uptime</span><strong>{Math.floor((system?.os?.uptime ?? 0) / 3600)}h</strong>
        </div>
        <div className="stack">
          {(system?.storage ?? []).map((storage) => (
            <div key={storage.mount}>
              <div className="metric-bar__label"><span>{storage.mount}</span><strong>{storage.usePercent}%</strong></div>
              <MetricBar label={storage.mount} value={storage.usePercent} detail={`${storage.usedGb}/${storage.sizeGb} GB`} tone="cyan" />
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
