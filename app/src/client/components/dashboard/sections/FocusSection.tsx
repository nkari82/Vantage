import { api } from "../../../lib/api";
import { steamHealthLabel, steamHealthTone } from "../constants";
import type { DashboardActions } from "../types";
import type { PowerStats, SteamReplayStatusResponse, SteamSessionStatusResponse, SystemStatus } from "../../../../shared/types";
import { CostSummaryCard } from "./CostSummaryCard";

interface FocusSectionProps {
  className: string;
  showSteamPanel: boolean;
  showGatewayPanel: boolean;
  showCostPanel: boolean;
  steamStatus: SteamSessionStatusResponse | null;
  steamReplay: SteamReplayStatusResponse | null;
  status: SystemStatus | null;
  powerStats: PowerStats | null;
  queueLoad: number;
  steamCounts: { queued: number; processing: number; completed: number; failed: number };
  gatewayToken: string;
  estimatedSystemPower: number;
  totalGpuPower: number;
  cpuPowerLabel: string;
  formatTimestamp: (value: number | null | undefined) => string;
  formatNumber: (value: number, digits?: number) => string;
  actions: Pick<DashboardActions, "runAction" | "setGatewayToken" | "saveGatewayToken">;
}

export function FocusSection({
  className,
  showSteamPanel,
  showGatewayPanel,
  showCostPanel,
  steamStatus,
  steamReplay,
  status,
  powerStats,
  queueLoad,
  steamCounts,
  gatewayToken,
  estimatedSystemPower,
  totalGpuPower,
  cpuPowerLabel,
  formatTimestamp,
  formatNumber,
  actions,
}: FocusSectionProps) {
  const focusClassName = [
    className,
    showSteamPanel && showGatewayPanel && showCostPanel ? "focus-grid--stacked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const steamPanel = (
    <article className="glass-card panel panel--section steam-panel focus-grid__panel focus-grid__steam">
      <div className="panel__head">
        <div>
          <p className="eyebrow">Steam Service</p>
          <h2>Session & Replay</h2>
        </div>
        <span className={`pill ${steamHealthTone(steamStatus)}`}>{steamHealthLabel(steamStatus)}</span>
      </div>
      <div className="steam-panel__hero steam-panel__hero--three">
        <div>
          <small>Session</small>
          <strong>{steamStatus?.steamSessionActive ? "ACTIVE" : "IDLE"}</strong>
        </div>
        <div>
          <small>Replay</small>
          <strong>{steamReplay?.shouldReplay ? "WAITING" : "CLEAR"}</strong>
        </div>
        <div>
          <small>Queue</small>
          <strong>{queueLoad}</strong>
        </div>
      </div>
      <div className="kv-list steam-panel__kv">
        <span>Adaptive Mode</span><strong>{steamStatus?.adaptiveMode ? "Enabled" : "Required"}</strong>
        <span>Session Started</span><strong>{formatTimestamp(steamStatus?.steamSessionStartedAt ?? status?.steamSessionStartedAt ?? null)}</strong>
        <span>Watchdog</span><strong>{formatTimestamp(steamStatus?.watchdogExpiresAt)}</strong>
        <span>Replay Requested</span><strong>{formatTimestamp(steamReplay?.replayRequestedAt ?? steamStatus?.replayRequestedAt ?? null)}</strong>
      </div>
      <div className="steam-queue-grid">
        <div>
          <small>Queued</small>
          <strong>{steamCounts.queued}</strong>
        </div>
        <div>
          <small>Processing</small>
          <strong>{steamCounts.processing}</strong>
        </div>
        <div>
          <small>Completed</small>
          <strong>{steamCounts.completed}</strong>
        </div>
        <div>
          <small>Failed</small>
          <strong>{steamCounts.failed}</strong>
        </div>
      </div>
      <p className="muted-copy steam-panel__copy">
        Steam session API는 ADAPTIVE 모드에서만 동작합니다. 세션 종료 시 vLLM 재기동과 replay 플로우가 이어집니다.
      </p>
      <div className="button-row steam-panel__actions">
        <button onClick={() => void actions.runAction(() => api.startSteamSession(), "Steam 세션 시작 명령을 전송했습니다.")}>Start Session</button>
        <button onClick={() => void actions.runAction(() => api.endSteamSession(), "Steam 세션 종료 및 replay 요청을 전송했습니다.")}>End Session</button>
        <button onClick={() => void actions.runAction(() => api.requestSteamReplay(), "Replay 요청을 전송했습니다.")}>Request Replay</button>
        <button onClick={() => void actions.runAction(() => api.finishSteamReplay(), "Replay 상태를 정리했습니다.")}>Finish Replay</button>
      </div>
    </article>
  );

  const gatewayPanel = (
    <article className="glass-card panel panel--section focus-grid__panel focus-grid__gateway">
      <div className="panel__head">
        <div>
          <p className="eyebrow">LLM Gateway</p>
          <h2>Gateway Control</h2>
        </div>
        <span className={`pill ${status?.llmGatewayEnabled ? "pill--green" : "pill--red"}`}>
          {status?.llmGatewayEnabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div className="kv-list">
        <span>Ready</span><strong>{status?.llmReady ? "Yes" : "No"}</strong>
        <span>Upstream</span><strong>{status?.gateway.upstreamUrl ?? "-"}</strong>
        <span>Listen</span><strong>{status?.gateway.listenPort ?? "-"}</strong>
        <span>Idle Timeout</span><strong>{status?.gateway.idleTimeoutMinutes ?? "-"} min</strong>
      </div>
      <div className="token-box">
        <input
          type="text"
          value={gatewayToken}
          onChange={(event) => actions.setGatewayToken(event.target.value)}
          placeholder="Gateway token (default: x)"
        />
        <button onClick={actions.saveGatewayToken}>Save Token</button>
      </div>
      <p className="muted-copy">별도 값을 저장하지 않으면 런타임 기본값인 x를 사용합니다.</p>
      <div className="button-row">
        <button onClick={() => void actions.runAction(() => api.setGatewayEnabled(!(status?.llmGatewayEnabled ?? false)), status?.llmGatewayEnabled ? "LLM Gateway를 비활성화했습니다." : "LLM Gateway를 활성화했습니다.")}>{status?.llmGatewayEnabled ? "Disable Gateway" : "Enable Gateway"}</button>
        <button onClick={() => void actions.runAction(() => api.touchLlm(), "LLM Gateway keepalive를 전송했습니다.")}>Touch</button>
        <button onClick={() => void actions.runAction(() => api.startLlm(), "vLLM 시작 명령을 전송했습니다.")}>Start vLLM</button>
        <button onClick={() => void actions.runAction(() => api.stopLlm(), "vLLM 중지 명령을 전송했습니다.")}>Stop vLLM</button>
      </div>
    </article>
  );

  const costPanel = (
    <CostSummaryCard
      powerStats={powerStats}
      estimatedSystemPower={estimatedSystemPower}
      totalGpuPower={totalGpuPower}
      cpuPowerLabel={cpuPowerLabel}
      status={status}
      formatNumber={formatNumber}
      compact
    />
  );

  const hasStackedSide = showSteamPanel && showGatewayPanel && showCostPanel;

  return (
    <section className={focusClassName}>
      {showSteamPanel && steamPanel}

      {hasStackedSide ? (
        <div className="focus-grid__stack">
          {gatewayPanel}
          {costPanel}
        </div>
      ) : (
        <>
          {showGatewayPanel && gatewayPanel}
          {showCostPanel && costPanel}
        </>
      )}
    </section>
  );
}
