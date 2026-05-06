import type { PowerMode } from "../../../../shared/types";

interface PowerTimelineCardProps {
  powerHistory: Array<{ mode: PowerMode; timestamp: number }>;
  formatTimestamp: (value: number | null | undefined) => string;
  compact?: boolean;
}

export function PowerTimelineCard({ powerHistory, formatTimestamp, compact = false }: PowerTimelineCardProps) {
  return (
    <article className={`glass-card panel panel--section utility-grid__secondary ${compact ? "timeline-card--compact" : ""}`.trim()}>
      <div className="panel__head"><h2>Power Timeline</h2><span className="pill pill--amber">latest first</span></div>
      <div className="timeline">
        {powerHistory.length === 0 && <p className="empty">모드 변경 기록이 없습니다. 모드를 변경하면 타임라인이 표시됩니다.</p>}
        {powerHistory.map((entry) => (
          <div className="timeline__item" key={`${entry.mode}-${entry.timestamp}`}>
            <span />
            <strong>{entry.mode}</strong>
            <small>{formatTimestamp(entry.timestamp)}</small>
          </div>
        ))}
      </div>
    </article>
  );
}
