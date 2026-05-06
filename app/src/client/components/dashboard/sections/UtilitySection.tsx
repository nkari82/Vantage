import { serviceLabel } from "../constants";
import type { PowerMode } from "../../../../shared/types";
import { PowerTimelineCard } from "./PowerTimelineCard";

interface UtilitySectionProps {
  className: string;
  showServiceHealthSection: boolean;
  showPowerTimelineSection: boolean;
  serviceEntries: Array<[string, string]>;
  powerHistory: Array<{ mode: PowerMode; timestamp: number }>;
  formatTimestamp: (value: number | null | undefined) => string;
}

export function UtilitySection({
  className,
  showServiceHealthSection,
  showPowerTimelineSection,
  serviceEntries,
  powerHistory,
  formatTimestamp,
}: UtilitySectionProps) {
  return (
    <section className={className}>
      {showServiceHealthSection && (
        <article className="glass-card panel panel--section utility-grid__primary">
          <div className="panel__head"><h2>Service Health</h2><span className="pill pill--cyan">runtime</span></div>
          <div className="service-grid">
            {serviceEntries.map(([name, value]) => (
              <div className={`service-chip service-chip--${value === "active" ? "ok" : "bad"}`} key={name}>
                <span />
                <strong>{serviceLabel(name)}</strong>
                <small>{value}</small>
              </div>
            ))}
          </div>
        </article>
      )}

      {showPowerTimelineSection && <PowerTimelineCard powerHistory={powerHistory} formatTimestamp={formatTimestamp} />}
    </section>
  );
}
