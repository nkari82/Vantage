import path from "node:path";

export const LOGICAL_MONITORED_SERVICES = [
  "vantage-backend.service",
  "vantage-llm-gateway.service",
  "vllm-coder.service",
  "vantage-ak620-agent.service",
  "vantage-adaptive-engine.service",
  "vantage-system-agent.service",
] as const;

export const WINDOWS_SERVICE_NAME_MAP: Record<string, string> = {
  "vantage-backend.service": "VantageBackend",
  "vantage-llm-gateway.service": "VantageLlmGateway",
  "vllm-coder.service": "VllmCoder",
  "vantage-ak620-agent.service": "VantageAk620Agent",
  "vantage-adaptive-engine.service": "VantageAdaptiveEngine",
  "vantage-system-agent.service": "VantageSystemAgent",
};

function stripLinuxServiceSuffix(serviceName: string): string {
  return serviceName.trim().replace(/\.service$/i, "");
}

export function getActualServiceName(serviceName: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") {
    return serviceName;
  }

  const trimmed = serviceName.trim();
  if (WINDOWS_SERVICE_NAME_MAP[trimmed]) {
    return WINDOWS_SERVICE_NAME_MAP[trimmed];
  }

  const withoutSuffix = stripLinuxServiceSuffix(trimmed);
  return WINDOWS_SERVICE_NAME_MAP[`${withoutSuffix}.service`] ?? withoutSuffix;
}

export function getMonitoredServiceEntries(platform: NodeJS.Platform = process.platform): Array<{ logical: string; actual: string }> {
  return LOGICAL_MONITORED_SERVICES.map((logical) => ({
    logical,
    actual: getActualServiceName(logical, platform),
  }));
}

export function getDefaultTrackedServices(): string[] {
  return [...LOGICAL_MONITORED_SERVICES];
}

export function getWindowsLogDir(cwd: string = process.cwd()): string {
  return process.env.VANTAGE_LOG_DIR ?? path.resolve(cwd, "logs");
}

export function getWindowsLogFilePath(serviceName: string, cwd: string = process.cwd()): string {
  return path.join(getWindowsLogDir(cwd), `${getActualServiceName(serviceName, "win32")}.log`);
}
