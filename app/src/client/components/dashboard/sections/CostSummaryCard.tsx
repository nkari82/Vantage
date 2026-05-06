import type { PowerStats, SystemStatus } from "../../../../shared/types";

interface CostSummaryCardProps {
  powerStats: PowerStats | null;
  estimatedSystemPower: number;
  totalGpuPower: number;
  cpuPowerLabel: string;
  status: SystemStatus | null;
  formatNumber: (value: number, digits?: number) => string;
  compact?: boolean;
}

export function CostSummaryCard({
  powerStats,
  estimatedSystemPower,
  totalGpuPower,
  cpuPowerLabel,
  status,
  formatNumber,
  compact = false,
}: CostSummaryCardProps) {
  return (
    <article className={`glass-card panel panel--section focus-grid__panel focus-grid__cost ${compact ? "cost-card--compact-shell" : ""}`.trim()}>
      <div className="panel__head">
        <div>
          <p className="eyebrow">Electricity Cost</p>
          <h2>Monthly Estimate</h2>
        </div>
        <span className="pill pill--cyan">{formatNumber(powerStats?.totalKwh ?? 0, 1)} kWh</span>
      </div>
      <div className={`cost-card__body ${compact ? "cost-card__body--compact" : ""}`.trim()}>
        <div className="cost-card__value">
          {formatNumber(powerStats?.cost ?? 0, 0)} <small>원</small>
        </div>
        <div className="cost-card__usage">{formatNumber(estimatedSystemPower, 0)} W live system draw</div>
        <div className="cost-card__caption">{cpuPowerLabel}</div>
      </div>
      <div className="power-breakdown power-breakdown--stack">
        <span><strong>{formatNumber(totalGpuPower, 1)} W</strong> GPU</span>
        <span><strong>{formatNumber(status?.system?.basePowerEstimateW ?? 0, 1)} W</strong> Base</span>
      </div>
    </article>
  );
}
