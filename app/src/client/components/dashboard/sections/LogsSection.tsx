import { services } from "../constants";

interface LogsSectionProps {
  logService: string;
  logLines: number;
  logs: string[];
  onLogServiceChange: (value: string) => void;
  onLogLinesChange: (value: number) => void;
  onRefresh: () => void;
}

export function LogsSection({
  logService,
  logLines,
  logs,
  onLogServiceChange,
  onLogLinesChange,
  onRefresh,
}: LogsSectionProps) {
  return (
    <section className="glass-card panel logs-panel">
      <div className="panel__head">
        <div><p className="eyebrow">Runtime Feed</p><h2>System Logs</h2></div>
        <div className="log-controls">
          <select value={logService} onChange={(event) => onLogServiceChange(event.target.value)}>
            {services.map((service) => <option key={service}>{service}</option>)}
          </select>
          <input type="number" min={20} max={300} value={logLines} onChange={(event) => onLogLinesChange(Number(event.target.value))} />
          <button onClick={onRefresh}>Refresh</button>
        </div>
      </div>
      <pre>{logs.length > 0 ? logs.join("\n") : "loading logs..."}</pre>
    </section>
  );
}
