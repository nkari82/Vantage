import { clampPercent } from "../lib/format";

interface MetricBarProps {
  label: string;
  value: number;
  detail?: string;
  tone?: "cyan" | "green" | "amber" | "red";
}

export function MetricBar({ label, value, detail, tone = "cyan" }: MetricBarProps) {
  const pct = clampPercent(value);
  return (
    <div className="metric-bar">
      <div className="metric-bar__label">
        <span>{label}</span>
        <strong>{detail ?? `${pct.toFixed(0)}%`}</strong>
      </div>
      <div className="meter">
        <span className={`meter__fill meter__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
