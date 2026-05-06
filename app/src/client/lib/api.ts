import type {
  ApiOk,
  AppConfig,
  HistoryEnvelope,
  LogEnvelope,
  MetricEnvelope,
  PowerMode,
  ServiceActionEnvelope,
  SystemMetrics,
  SystemStatus,
  GpuStatus,
  PowerStats,
  SteamQueueEnqueueResponse,
  SteamQueueJob,
  SteamReplayRequestResponse,
  SteamReplayStatusResponse,
  SteamSessionEndResponse,
  SteamSessionStartResponse,
  SteamSessionStatusResponse,
  QueueJobStatus,
} from "../../shared/types";

const backendBase = "";
const adminTokenKey = "vantage.adminToken";
const gatewayTokenKey = "vantage.gatewayToken";

function readStoredToken(key: string): string {
  return window.localStorage.getItem(key)?.trim()
    ?? window.sessionStorage.getItem(key)?.trim()
    ?? "";
}

function writeStoredToken(key: string, token: string, remember = true): void {
  const trimmed = token.trim();
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);

  if (!trimmed) {
    return;
  }

  if (remember) {
    window.localStorage.setItem(key, trimmed);
    return;
  }

  window.sessionStorage.setItem(key, trimmed);
}

function getAdminToken(): string {
  return readStoredToken(adminTokenKey);
}

function setAdminToken(token: string, remember = true): void {
  writeStoredToken(adminTokenKey, token, remember);
}

function getGatewayToken(): string {
  return readStoredToken(gatewayTokenKey);
}

function setGatewayToken(token: string, remember = true): void {
  writeStoredToken(gatewayTokenKey, token, remember);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${backendBase}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const expectsJson = contentType.includes("application/json");
  let data: unknown = null;

  if (text) {
    if (expectsJson) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`Invalid JSON response from ${path}`);
      }
    } else {
      data = text;
    }
  }

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "message" in data
      ? String(data.message)
      : typeof data === "object" && data !== null && "error" in data
        ? String(data.error)
        : typeof data === "string" && data.trim().startsWith("<")
          ? `Expected JSON but received HTML from ${path}`
          : typeof data === "string" && data.trim().length > 0
            ? data.trim()
            : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!expectsJson) {
    throw new Error(`Expected JSON response from ${path}`);
  }

  return data as T;
}

export const api = {
  getAdminToken,
  setAdminToken,
  getGatewayToken,
  setGatewayToken,
  login: (username: string, password: string) => request<{ ok: true; token: string }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  status: () => request<SystemStatus>("/api/status"),
  getConfig: () => request<AppConfig>("/api/config"),
  steamSessionStatus: () => request<SteamSessionStatusResponse>("/api/steam/session/status"),
  steamReplayStatus: () => request<SteamReplayStatusResponse>("/api/steam/queue/replay/status"),
  startSteamSession: () => request<SteamSessionStartResponse>("/api/steam/session/start", { method: "POST", body: "{}" }),
  endSteamSession: () => request<SteamSessionEndResponse>("/api/steam/session/end", { method: "POST", body: "{}" }),
  requestSteamReplay: () => request<SteamReplayRequestResponse>("/api/steam/queue/replay/request", { method: "POST", body: "{}" }),
  finishSteamReplay: () => request<ApiOk>("/api/steam/queue/replay/finish", { method: "POST", body: "{}" }),
  steamQueueEnqueue: (requestSnapshot: unknown, idempotencyKey?: string) => request<SteamQueueEnqueueResponse>("/api/steam/queue/enqueue", {
    method: "POST",
    body: JSON.stringify({ requestSnapshot, idempotencyKey }),
  }),
  steamQueueJob: (jobId: string) => request<QueueJobStatus>(`/api/steam/queue/${encodeURIComponent(jobId)}`),
  steamQueueClaim: () => request<ApiOk & { job: SteamQueueJob | null }>("/api/steam/queue/claim", { method: "POST", body: "{}" }),
  setMode: (mode: PowerMode) => request<ApiOk & { mode: PowerMode }>("/api/mode", {
    method: "POST",
    body: JSON.stringify({ mode }),
  }),
  setGatewayEnabled: (enabled: boolean) => request<ApiOk & { enabled: boolean }>("/api/llm-gateway/enabled", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  }),
  startLlm: () => request<ApiOk>("/api/llm/start", { method: "POST", body: "{}" }),
  stopLlm: () => request<ApiOk>("/api/llm/stop", { method: "POST", body: "{}" }),
  touchLlm: () => request<ApiOk & { lastUsedAt: number }>("/api/llm/touch", { method: "POST", body: "{}" }),
  restartService: (service: string) => request<ServiceActionEnvelope>(`/api/system/services/${encodeURIComponent(service)}/restart`, { method: "POST", body: "{}" }),
  reboot: () => request<ApiOk>("/api/system/reboot", { method: "POST", body: "{}" }),
  testCpu: (duration: number) => request<ApiOk>("/api/system/test/cpu", {
    method: "POST",
    body: JSON.stringify({ duration }),
  }),
  testMemory: (duration: number) => request<ApiOk>("/api/system/test/memory", {
    method: "POST",
    body: JSON.stringify({ duration }),
  }),
  memtest: () => request<ApiOk>("/api/system/test/memtest", { method: "POST", body: "{}" }),
  shutdown: () => request<ApiOk>("/api/system/shutdown", { method: "POST", body: "{}" }),
  saveAk620Interval: (seconds: number) => request<ApiOk & { refreshIntervalSeconds: number; note?: string }>("/api/ak620/refresh-interval", {
    method: "POST",
    body: JSON.stringify({ seconds }),
  }),
  saveConfig: (nextConfig: Partial<AppConfig>) => request<ApiOk & { config: AppConfig }>("/api/config", {
    method: "POST",
    body: JSON.stringify(nextConfig),
  }),
  logs: (service: string, lines: number, query = "", level: "all" | "debug" | "info" | "warn" | "error" = "all") => request<LogEnvelope>(`/api/logs?service=${encodeURIComponent(service)}&lines=${encodeURIComponent(lines)}&query=${encodeURIComponent(query)}&level=${encodeURIComponent(level)}`),
  gpuMetrics: () => request<MetricEnvelope<GpuStatus & { timestamp: number }>>("/api/gpu-metrics"),
  systemMetrics: () => request<MetricEnvelope<SystemMetrics & { timestamp: number }>>("/api/system-metrics"),
  powerHistory: () => request<HistoryEnvelope>("/api/power-history"),
  powerStats: () => request<PowerStats>("/api/system/power-stats"),
  stressStatus: () => request<{
    isTesting: boolean;
    currentTest?: "cpu" | "memory";
    lastError?: string;
    lastFinishedAt?: number;
  }>("/api/system/test/status"),
};
