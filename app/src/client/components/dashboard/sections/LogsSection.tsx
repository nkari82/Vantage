import type { LogEntry, LogLevel, LogLevelFilter } from "../../../../shared/types";
import { services, serviceLabel } from "../constants";

interface LogsSectionProps {
  logService: string;
  logLines: number;
  logQuery: string;
  logLevel: LogLevelFilter;
  logEntries: LogEntry[];
  logSource: string | null;
  logTotal: number;
  logsUnavailable: boolean;
  onLogServiceChange: (value: string) => void;
  onLogLinesChange: (value: number) => void;
  onLogQueryChange: (value: string) => void;
  onLogLevelChange: (value: LogLevelFilter) => void;
  onRefresh: () => void;
  formatTimestamp: (value: number | null | undefined) => string;
}

const levelOptions: LogLevelFilter[] = ["all", "error", "warn", "info", "debug"];

function levelTone(level: LogLevel): string {
  switch (level) {
    case "error":
      return "pill--red";
    case "warn":
      return "pill--amber";
    case "info":
      return "pill--green";
    case "debug":
      return "pill--cyan";
    default:
      return "pill--cyan";
  }
}

export function LogsSection({
  logService,
  logLines,
  logQuery,
  logLevel,
  logEntries,
  logSource,
  logTotal,
  logsUnavailable,
  onLogServiceChange,
  onLogLinesChange,
  onLogQueryChange,
  onLogLevelChange,
  onRefresh,
  formatTimestamp,
}: LogsSectionProps) {
  return (
    <section className="glass-card panel logs-panel">
      <div className="panel__head logs-panel__head">
        <div>
          <p className="eyebrow">Runtime Feed</p>
          <h2>System Logs</h2>
          <p className="muted-copy logs-panel__copy">
            서비스별 로그를 level / query 기준으로 바로 좁혀서 확인합니다.
          </p>
        </div>
        <div className="logs-panel__summary">
          <span className="pill pill--cyan">{serviceLabel(logService)}</span>
          <span className="pill pill--green">{logTotal} entries</span>
          {logSource && <span className="pill pill--amber">{logSource}</span>}
          {logsUnavailable && <span className="pill pill--red">unavailable</span>}
        </div>
      </div>

      <div className="log-controls logs-panel__filters">
        <select value={logService} onChange={(event) => onLogServiceChange(event.target.value)}>
          {services.map((service) => <option key={service}>{service}</option>)}
        </select>
        <select value={logLevel} onChange={(event) => onLogLevelChange(event.target.value as LogLevelFilter)}>
          {levelOptions.map((level) => <option key={level} value={level}>{level.toUpperCase()}</option>)}
        </select>
        <input
          type="search"
          value={logQuery}
          placeholder="filter text"
          onChange={(event) => onLogQueryChange(event.target.value)}
        />
        <input
          type="number"
          min={20}
          max={300}
          value={logLines}
          onChange={(event) => onLogLinesChange(Number(event.target.value))}
        />
        <button onClick={onRefresh}>Refresh</button>
      </div>

      <div className="logs-stream">
        {logEntries.length > 0 ? logEntries.map((entry, index) => (
          <article key={`${entry.timestamp ?? "none"}-${index}-${entry.raw.slice(0, 24)}`} className="log-entry">
            <div className="log-entry__meta">
              <span className={`pill ${levelTone(entry.level)}`}>{entry.level.toUpperCase()}</span>
              <span>{formatTimestamp(entry.timestamp)}</span>
            </div>
            <strong>{entry.message || entry.raw}</strong>
            {entry.message !== entry.raw && <code>{entry.raw}</code>}
          </article>
        )) : (
          <div className="logs-empty">조건에 맞는 로그가 없습니다.</div>
        )}
      </div>
    </section>
  );
}
