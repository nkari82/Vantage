import { ISystemController } from "@vantage/common";
import fs from "node:fs";
import { runCommand } from "../shell.js";
import { loadConfig } from "../config.js";
import { getActualServiceName } from "../service-runtime.js";

const POWER_PLAN_GUIDS = {
  balanced: "381b4222-f694-41f0-9685-ff5bb260df2e",
  powerSaver: "a1841308-3541-4fab-bc81-f71556f20b4a",
  highPerformance: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
} as const;

function resolvePowerPlanGuid(mode: string): string {
  switch (mode.toUpperCase()) {
    case "LOW_POWER":
      return POWER_PLAN_GUIDS.powerSaver;
    case "STANDARD_250":
    case "STANDARD_280":
    case "DEFAULT":
      return POWER_PLAN_GUIDS.highPerformance;
    default:
      return POWER_PLAN_GUIDS.balanced;
  }
}

async function tryApplyGpuPowerLimit(limitW?: number): Promise<void> {
  if (!Number.isFinite(limitW)) {
    return;
  }

  try {
    await runCommand("nvidia-smi", ["-pm", "1"]);
    await runCommand("nvidia-smi", ["-pl", String(Math.round(limitW!))]);
  } catch (error) {
    console.warn(
      "[win32-controller] failed to apply NVIDIA power limit; power plan still updated",
      error instanceof Error ? error.message : error,
    );
  }
}

async function runPowerShell(command: string): Promise<void> {
  await runCommand("powershell", ["-NoProfile", "-NonInteractive", "-Command", command]);
}

function ensureModeExists(mode: string): { gpuPowerLimitW?: number } {
  const config = loadConfig();
  const normalizedMode = mode.toUpperCase() as keyof typeof config.powerModes;
  const modeConfig = config.powerModes[normalizedMode];
  if (!modeConfig) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  return modeConfig;
}

function serviceMissing(message: string): boolean {
  return /service has not been started|service name is invalid|does not exist as an installed service/i.test(message);
}

export class Win32Controller implements ISystemController {
  async restartSystem(): Promise<void> {
    await runCommand("shutdown", ["/r", "/t", "0"]);
  }

  async shutdownSystem(): Promise<void> {
    await runCommand("shutdown", ["/s", "/t", "0"]);
  }

  async applyPowerMode(mode: string): Promise<void> {
    const modeConfig = ensureModeExists(mode);
    await runCommand("powercfg", ["/setactive", resolvePowerPlanGuid(mode)]);
    await tryApplyGpuPowerLimit(modeConfig.gpuPowerLimitW);
  }

  async startService(serviceName: string): Promise<void> {
    await runCommand("net", ["start", getActualServiceName(serviceName, "win32")]);
  }

  async stopService(serviceName: string): Promise<void> {
    const actualName = getActualServiceName(serviceName, "win32");
    try {
      await runCommand("net", ["stop", actualName]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (serviceMissing(message)) {
        return;
      }
      throw error;
    }
  }

  async isServiceActive(serviceName: string): Promise<boolean> {
    try {
      const { stdout } = await runCommand("sc", ["query", getActualServiceName(serviceName, "win32")]);
      return stdout.includes("RUNNING");
    } catch {
      return false;
    }
  }

  async runCpuStressTest(durationSeconds: number): Promise<void> {
    const command = `for ($i=0; $i -lt [Environment]::ProcessorCount; $i++) { Start-Job -ScriptBlock { $start = [DateTime]::Now; while (([DateTime]::Now - $start).TotalSeconds -lt ${durationSeconds}) { $x=0; $x++ } } }`;
    await runPowerShell(command);
  }

  async runMemoryStressTest(durationSeconds: number): Promise<void> {
    const command = `$m = New-Object byte[] (1024*1024*1024*2); Start-Sleep -Seconds ${durationSeconds}`;
    await runPowerShell(command);
  }

  async rebootToMemtest(): Promise<void> {
    throw new Error("Memtest86 is not supported on Windows. This feature is only available on Linux systems with GRUB.");
  }
}
