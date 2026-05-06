import type { PowerMode, SteamSessionStatusResponse, SystemStatus } from "../../../shared/types";

export const modeList: PowerMode[] = ["DEFAULT", "LOW_POWER", "STANDARD_250", "STANDARD_280", "ADAPTIVE"];

export const services = [
  "vantage-backend.service",
  "vantage-llm-gateway.service",
  "vllm-coder.service",
  "vantage-ak620-agent.service",
  "vantage-adaptive-engine.service",
  "vantage-system-agent.service",
] as const;

export const railItems = [
  { key: "overview", label: "Overview" },
  { key: "signals", label: "Signals" },
  { key: "steam", label: "Steam" },
  { key: "gateway", label: "Gateway" },
  { key: "systems", label: "Systems" },
  { key: "settings", label: "Settings" },
] as const;

export type RailKey = (typeof railItems)[number]["key"];
export type HealthState = "ok" | "warn" | "bad";

export const railGroups: Array<{ label: string; items: RailKey[] }> = [
  { label: "Core", items: ["overview", "signals"] },
  { label: "Runtime", items: ["steam", "gateway", "systems"] },
  { label: "Control", items: ["settings"] },
];

export const railPageCopy: Record<RailKey, { title: string; description: string }> = {
  overview: {
    title: "Adaptive Compute Mission Control",
    description: "핵심 상태와 운영 지표를 한 페이지에서 빠르게 확인하는 개요 화면입니다.",
  },
  signals: {
    title: "Platform Signals",
    description: "실시간 시그널, 열 분포, 서비스 상태 밀도를 집중 확인하는 분석 화면입니다.",
  },
  steam: {
    title: "Steam Session Operations",
    description: "세션 시작·종료·리플레이 흐름과 큐 상태를 관리하는 전용 화면입니다.",
  },
  gateway: {
    title: "Gateway Runtime Control",
    description: "Gateway 활성화, vLLM 제어, 토큰 설정을 다루는 전용 화면입니다.",
  },
  systems: {
    title: "Systems & Telemetry",
    description: "GPU, 시스템 리소스, 서비스 헬스, 로그를 모아 보는 운영 화면입니다.",
  },
  settings: {
    title: "Power Profiles & Admin Actions",
    description: "전력 프로필과 스트레스 테스트, 재부팅/종료 액션을 다루는 제어 화면입니다.",
  },
};

export const loginRequiredLogsMessage = "로그인 후 시스템 로그를 확인할 수 있습니다.";

export function getRailFromHash(hash: string): RailKey {
  const normalized = hash.replace(/^#/, "");
  return railItems.find((item) => item.key === normalized)?.key ?? "overview";
}

export function serviceLabel(name: string): string {
  return name.replace(".service", "").replace("vantage-", "");
}

export function getHealth(status?: SystemStatus): HealthState {
  if (!status) return "warn";
  if ((status.alerts?.length ?? 0) > 0 || status.system?.degraded) return "bad";
  const inactive = Object.values(status.system?.serviceStatus ?? {}).filter((value) => value !== "active").length;
  return inactive > 0 ? "warn" : "ok";
}

export function steamHealthTone(status: SteamSessionStatusResponse | null): "pill--cyan" | "pill--green" | "pill--amber" {
  if (!status) return "pill--cyan";
  const queueSummary = status.queueSummary ?? { queued: 0, processing: 0, completed: 0, failed: 0 };
  if (status.steamSessionActive) return "pill--green";
  if (status.shouldReplay || queueSummary.processing > 0 || queueSummary.queued > 0) return "pill--amber";
  return "pill--cyan";
}

export function steamHealthLabel(status: SteamSessionStatusResponse | null): string {
  if (!status) return "SYNCING";
  const queueSummary = status.queueSummary ?? { queued: 0, processing: 0, completed: 0, failed: 0 };
  if (status.steamSessionActive) return "SESSION LIVE";
  if (status.shouldReplay) return "REPLAY PENDING";
  if (queueSummary.processing > 0) return "QUEUE RUNNING";
  if (queueSummary.queued > 0) return "QUEUE READY";
  return status.adaptiveMode ? "STANDBY" : "ADAPTIVE ONLY";
}

export function modeLevel(mode: PowerMode): number {
  switch (mode) {
    case "LOW_POWER":
      return 20;
    case "STANDARD_250":
      return 52;
    case "STANDARD_280":
      return 68;
    case "ADAPTIVE":
      return 82;
    case "DEFAULT":
    default:
      return 40;
  }
}

export function ensureSeries(values: number[] | null | undefined, fallback: number): number[] {
  const safeValues = Array.isArray(values) ? values : [];
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  const clean = safeValues.filter((value) => Number.isFinite(value));
  const base = clean.length > 0 ? [...clean] : [safeFallback];

  while (base.length < 6) {
    base.unshift(base[0]);
  }

  return base.slice(-8);
}

export function buildPolyline(values: number[] | null | undefined): string {
  const safeValues = Array.isArray(values) ? values : [];
  if (safeValues.length === 0) {
    return "0,100 100,100";
  }

  const max = Math.max(1, ...safeValues);
  return safeValues.map((value, index) => {
    const x = safeValues.length <= 1 ? 0 : (index / (safeValues.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, (value / max) * 100));
    return `${x},${y}`;
  }).join(" ");
}

export function renderRailIcon(key: RailKey) {
  switch (key) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="7" height="7" rx="2" />
          <rect x="14" y="4" width="7" height="4" rx="2" />
          <rect x="14" y="11" width="7" height="9" rx="2" />
          <rect x="3" y="14" width="7" height="6" rx="2" />
        </svg>
      );
    case "signals":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 15h3l2.5-6 4 10 2.5-6H21" />
        </svg>
      );
    case "steam":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="16" r="3" />
          <circle cx="16.5" cy="7.5" r="3.5" />
          <path d="M10.5 14.5l3.5-3" />
          <path d="M3.5 12.5l4 2" />
        </svg>
      );
    case "gateway":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      );
    case "systems":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="11" rx="3" />
          <path d="M8 20h8" />
          <path d="M12 16v4" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5l1.3 2.2 2.5.4-.8 2.4 1.7 1.8-1.7 1.8.8 2.4-2.5.4L12 19.5l-1.3-2.2-2.5-.4.8-2.4-1.7-1.8 1.7-1.8-.8-2.4 2.5-.4L12 4.5z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      );
    default:
      return null;
  }
}
