interface MiniChartProps {
  label: string;
  unit: string;
  values: number[];
  accent: string;
  max?: number;
}

export function MiniChart({ label, unit, values, accent, max }: MiniChartProps) {
  const cleanValues = values.filter(Number.isFinite).slice(-80);
  const chartMax = max ?? Math.max(1, ...cleanValues);
  const points = cleanValues.map((value, index) => {
    const x = cleanValues.length <= 1 ? 0 : (index / (cleanValues.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, (value / chartMax) * 100));
    return `${x},${y}`;
  }).join(" ");
  const latest = cleanValues[cleanValues.length - 1] ?? 0;

  return (
    <section className="metric-chart glass-card">
      <div className="chart-head">
        <span>{label}</span>
        <strong>{latest.toFixed(latest >= 10 ? 0 : 1)}{unit}</strong>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} trend`}>
        <defs>
          <linearGradient id={`fill-${label.replace(/\W/g, "")}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline className="gridline" points="0,25 100,25" />
        <polyline className="gridline" points="0,50 100,50" />
        <polyline className="gridline" points="0,75 100,75" />
        {cleanValues.length > 1 && <polygon points={`0,100 ${points} 100,100`} fill={`url(#fill-${label.replace(/\W/g, "")})`} />}
        {cleanValues.length > 1 && <polyline points={points} fill="none" stroke={accent} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
      </svg>
    </section>
  );
}
