import type { ApiOk, HistoryEnvelope, LogEnvelope, MetricEnvelope, PowerMode, SystemMetrics, SystemStatus, GpuStatus, PowerStats } from "../../shared/types";

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
  return readStoredToken(gatewayTokenKey) || "x";
}

function setGatewayToken(token: string, remember = true): void {
  writeStoredToken(gatewayTokenKey, token || "x", remember);
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
  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "message" in data
      ? String(data.message)
      : typeof data === "object" && data !== null && "error" in data
        ? String(data.error)
        : `HTTP ${response.status}`;
    throw new Error(message);
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
  logs: (service: string, lines: number) => request<LogEnvelope>(`/api/logs?service=${encodeURIComponent(service)}&lines=${encodeURIComponent(lines)}`),
  gpuMetrics: () => request<MetricEnvelope<GpuStatus & { timestamp: number }>>("/api/gpu-metrics"),
  systemMetrics: () => request<MetricEnvelope<SystemMetrics & { timestamp: number }>>("/api/system-metrics"),
  powerHistory: () => request<HistoryEnvelope>("/api/power-history"),
  powerStats: () => request<PowerStats>("/api/system/power-stats"),
  stressStatus: () => request<{
    isTesting: boolean;
    currentTest?: 'cpu' | 'memory';
    lastError?: string;
    lastFinishedAt?: number;
  }>("/api/system/test/status"),
};
