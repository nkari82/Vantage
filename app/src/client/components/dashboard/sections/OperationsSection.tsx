import { api } from "../../../lib/api";
import { modeList } from "../constants";
import type { DashboardActions, StressStatus } from "../types";
import type { PowerMode } from "../../../../shared/types";

interface OperationsSectionProps {
  currentMode: PowerMode | null | undefined;
  stressStatus: StressStatus | null;
  actions: Pick<DashboardActions, "runAction" | "confirmDangerousAction">;
}

export function OperationsSection({ currentMode, stressStatus, actions }: OperationsSectionProps) {
  return (
    <section className="operations-grid">
      <article className="glass-card panel panel--section operations-grid__modes">
        <div className="panel__head">
          <div>
            <p className="eyebrow">Power Profile</p>
            <h2>Mode Control</h2>
          </div>
          <span className="pill pill--cyan">{currentMode ?? "-"}</span>
        </div>
        <div className="mode-grid">
          {modeList.map((mode) => (
            <button
              className={`mode-button ${currentMode === mode ? "mode-button--active" : ""}`}
              key={mode}
              onClick={() => void actions.runAction(() => api.setMode(mode), `${mode} 모드로 전환했습니다.`)}
            >
              <span>{mode.replace("STANDARD_", "STD ")}</span>
              <small>{mode === "ADAPTIVE" ? "Auto idle" : mode === "DEFAULT" ? "Primary mode" : "Power capped"}</small>
            </button>
          ))}
        </div>
      </article>

      <article className="glass-card panel panel--section operations-grid__actions">
        <div className="panel__head">
          <div>
            <p className="eyebrow">Control Surface</p>
            <h2>Admin Actions</h2>
          </div>
          {stressStatus?.isTesting && (
            <div className="stress-status">
              <span className="stress-indicator" />
              <strong>{stressStatus.currentTest === "cpu" ? "CPU" : "Memory"} 테스트 진행 중</strong>
            </div>
          )}
        </div>
        <p className="muted-copy">운영 중 자주 쓰는 스트레스 테스트와 시스템 제어를 별도 영역으로 묶었습니다.</p>
        <div className="danger-zone">
          <button onClick={() => void actions.runAction(() => api.testCpu(10), "CPU 스트레스 테스트를 시작했습니다.")}>CPU Test</button>
          <button onClick={() => void actions.runAction(() => api.testMemory(10), "메모리 스트레스 테스트를 시작했습니다.")}>Memory Test</button>
          <button onClick={() => void actions.confirmDangerousAction("시스템을 재부팅할까요?", () => api.reboot(), "재부팅 명령을 전송했습니다.")}>Reboot</button>
          <button onClick={() => void actions.confirmDangerousAction("시스템을 종료할까요?", () => api.shutdown(), "종료 명령을 전송했습니다.")}>Shutdown</button>
        </div>
        {stressStatus?.lastError && <div className="stress-error">{stressStatus.lastError}</div>}
      </article>
    </section>
  );
}
