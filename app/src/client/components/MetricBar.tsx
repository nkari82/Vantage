import type { CSSProperties } from "react";
import { clampPercent } from "../lib/format";

type MetricBarTone = "cyan" | "green" | "amber" | "red" | "violet";

interface MetricBarProps {
  label: string;
  value: string | number;
  detail?: string;
  percent?: number;
  tone?: MetricBarTone;
}

export function MetricBar({ label, value, detail, percent, tone = "cyan" }: MetricBarProps) {
  const numericValue = typeof value === "number" ? value : Number(value);
  const pct = clampPercent(percent ?? (Number.isFinite(numericValue) ? numericValue : 0));
  const meterStyle = { "--meter-pct": `${pct}%` } as CSSProperties;
  const displayValue = detail ?? (typeof value === "number" ? `${pct.toFixed(0)}%` : value);

  return (
    <div className="metric-bar">
      <div className="metric-bar__label">
        <span>{label}</span>
        <strong>{displayValue}</strong>
      </div>
      <div className="meter">
        <span className={`meter__fill meter__fill--${tone}`} style={meterStyle} />
      </div>
    </div>
  );
}
