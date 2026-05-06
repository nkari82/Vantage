import type { OverviewStat } from "../types";

interface MetricsStripProps {
  stats: OverviewStat[];
}

export function MetricsStrip({ stats }: MetricsStripProps) {
  return (
    <section className="metrics-strip">
      {stats.map((card) => (
        <article className="metric-tile glass-card panel--section" key={card.eyebrow}>
          <div className="metric-tile__meta">
            <div>
              <p className="metric-tile__eyebrow">{card.eyebrow}</p>
              <strong>{card.value}</strong>
            </div>
            <span className="metric-tile__icon">{card.icon}</span>
          </div>
          <small>{card.delta}</small>
        </article>
      ))}
    </section>
  );
}
