import type { HealthState, RailKey } from "./constants";

interface WorkspaceTopbarProps {
  page: RailKey;
  title: string;
  description: string;
  health: HealthState;
  modeLabel: string;
}

export function WorkspaceTopbar({ page, title, description, health, modeLabel }: WorkspaceTopbarProps) {
  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar__copy">
        <p className="eyebrow">Vantage Mission Control</p>
        <h1>{title}</h1>
        <p className="hero__copy">{description}</p>
      </div>
      <div className="workspace-topbar__actions">
        <span className={`pill ${health === "ok" ? "pill--green" : health === "warn" ? "pill--amber" : "pill--red"}`}>{health.toUpperCase()}</span>
        <span className="pill pill--cyan">{modeLabel}</span>
        <span className="pill pill--amber page-pill">{page.toUpperCase()}</span>
      </div>
    </header>
  );
}
