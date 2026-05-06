import { railGroups, railItems, renderRailIcon, type RailKey } from "./constants";

interface CommandRailProps {
  activeRail: RailKey;
  onNavigate: (page: RailKey) => void;
  onLogout: () => void;
}

const railItemMap = new Map(railItems.map((item) => [item.key, item]));

export function CommandRail({ activeRail, onNavigate, onLogout }: CommandRailProps) {
  return (
    <aside className="command-rail glass-card">
      <div className="command-rail__brand-wrap">
        <div className="command-rail__brand">
          <span>V</span>
        </div>
        <div className="command-rail__brand-copy">
          <strong>Vantage</strong>
          <small>Mission Control</small>
        </div>
      </div>

      <div className="command-rail__groups" role="presentation">
        {railGroups.map((group) => (
          <div className="command-rail__group" key={group.label}>
            <p className="command-rail__group-label">{group.label}</p>
            <nav className="command-rail__menu" aria-label={`${group.label} pages`}>
              {group.items.map((key) => {
                const item = railItemMap.get(key);
                if (!item) return null;

                const isActive = activeRail === item.key;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={`command-rail__button ${isActive ? "command-rail__button--active" : ""}`}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                    title={item.label}
                    onClick={() => onNavigate(item.key)}
                  >
                    <span className="command-rail__icon">{renderRailIcon(item.key)}</span>
                    <span className="command-rail__text">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <button type="button" className="command-rail__button command-rail__button--logout" onClick={onLogout} title="로그아웃">
        <span className="command-rail__icon">↩</span>
        <span className="command-rail__text">Logout</span>
      </button>
    </aside>
  );
}
