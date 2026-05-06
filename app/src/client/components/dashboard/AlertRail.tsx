interface AlertRailProps {
  error: string | null;
  notice: string | null;
  alerts: string[];
  isWindows: boolean;
}

export function AlertRail({ error, notice, alerts, isWindows }: AlertRailProps) {
  if (!error && !notice && alerts.length === 0 && !isWindows) {
    return null;
  }

  return (
    <section className="alert-rail">
      {error && <div className="alert-card alert-card--bad">{error}</div>}
      {notice && <div className="alert-card alert-card--ok">{notice}</div>}
      {alerts.map((alert) => <div className="alert-card alert-card--bad" key={alert}>{alert}</div>)}
      {isWindows && (
        <div className="alert-card alert-card--warn">
          Windows 환경에서는 일부 systemd 기반 기능이 제한되며, 서비스 표시는 런타임 추상화 결과를 기준으로 제공됩니다.
        </div>
      )}
    </section>
  );
}
