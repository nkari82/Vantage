import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./shell.js";
import type { GpuStatus, SystemMetrics } from "./types.js";

export const MONITORED_SERVICES = [
  "vantage-backend.service",
  "vantage-llm-gateway.service",
  "vllm-coder.service",
  "vantage-ak620-agent.service",
] as const;

const POWER_CAP_ROOT = "/sys/class/powercap";
const DEFAULT_BASE_SYSTEM_POWER_W = 55;
let lastRaplSample: { energyMicroJoules: number; timestampMs: number } | null = null;

function getBasePowerEstimateW(): number {
  const parsed = Number(process.env.VANTAGE_BASE_SYSTEM_POWER_W ?? DEFAULT_BASE_SYSTEM_POWER_W);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BASE_SYSTEM_POWER_W;
  }

  return Math.min(Math.max(parsed, 0), 500);
}

function readCpuPackageEnergyMicroJoules(): number | null {
  if (!fs.existsSync(POWER_CAP_ROOT)) {
    return null;
  }

  const packageDirs = fs
    .readdirSync(POWER_CAP_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^intel-rapl:\d+$/.test(entry.name))
    .map((entry) => path.join(POWER_CAP_ROOT, entry.name));

  let total = 0;
  for (const packageDir of packageDirs) {
    const energyPath = path.join(packageDir, "energy_uj");
    if (!fs.existsSync(energyPath)) {
      continue;
    }

    const value = Number(fs.readFileSync(energyPath, "utf8").trim());
    if (Number.isFinite(value)) {
      total += value;
    }
  }

  return total > 0 ? total : null;
}

function sampleCpuPowerW(): number | null {
  try {
    const energyMicroJoules = readCpuPackageEnergyMicroJoules();
    const timestampMs = Date.now();
    if (energyMicroJoules === null) {
      lastRaplSample = null;
      return null;
    }

    const previous = lastRaplSample;
    lastRaplSample = { energyMicroJoules, timestampMs };
    if (!previous || energyMicroJoules < previous.energyMicroJoules) {
      return null;
    }

    const elapsedSeconds = (timestampMs - previous.timestampMs) / 1000;
    if (elapsedSeconds <= 0) {
      return null;
    }

    const joules = (energyMicroJoules - previous.energyMicroJoules) / 1_000_000;
    return Number.parseFloat((joules / elapsedSeconds).toFixed(1));
  } catch {
    return null;
  }
}

export function withEstimatedSystemPower(gpus: GpuStatus[], system: SystemMetrics): SystemMetrics {
  const gpuPowerW = gpus.reduce((total, gpu) => total + gpu.powerW, 0);
  return {
    ...system,
    estimatedSystemPowerW: Number.parseFloat((gpuPowerW + (system.cpuPowerW ?? 0) + system.basePowerEstimateW).toFixed(1)),
  };
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const basePowerEstimateW = getBasePowerEstimateW();
  const cpuPowerW = sampleCpuPowerW();

  try {
    const { stdout: mpstat } = await runCommand("mpstat", ["-P", "ALL", "1", "1"]);
    const lines = mpstat.split("\n");

    let avgUsage = 0;
    const coresUsage: number[] = [];

    for (const line of lines) {
      if (line.includes("all")) {
        const parts = line.trim().split(/\s+/);
        const idle = Number.parseFloat(parts[parts.length - 1] ?? "100");
        avgUsage = 100 - idle;
      } else if (line.match(/^\d{2}:\d{2}:\d{2}/) && !line.includes("CPU")) {
        const parts = line.trim().split(/\s+/);
        if (parts[1] !== "all") {
          const idle = Number.parseFloat(parts[parts.length - 1] ?? "100");
          coresUsage.push(Math.round(100 - idle));
        }
      }
    }

    const { stdout: cpuInfo } = await runCommand("grep", ["cpu MHz", "/proc/cpuinfo"]);
    const clockMatch = cpuInfo.match(/cpu MHz\s+:\s+(\d+\.\d+)/);
    const cpuClock = clockMatch ? Number.parseFloat(clockMatch[1]) : 0;

    const { stdout: memInfo } = await runCommand("free", ["-m"]);
    const memMatch = memInfo.match(/Mem:\s+(\d+)\s+(\d+)/);
    const totalMemGb = memMatch ? Number.parseFloat(memMatch[1]) / 1024 : 0;
    const usedMemGb = memMatch ? Number.parseFloat(memMatch[2]) / 1024 : 0;

    const { stdout: sensors } = await runCommand("sensors", ["-A"]);
    const temperatures: Record<string, number> = {};
    for (const line of sensors.split("\n")) {
      const match = line.match(/^(.+?):\s+\+(\d+\.\d+)°C/);
      if (match) {
        temperatures[match[1].trim().replace(/\s+/g, "_")] = Number.parseFloat(match[2]);
      }
    }

    const serviceStatus: Record<string, string> = {};
    for (const service of MONITORED_SERVICES) {
      try {
        const { stdout } = await runCommand("/bin/systemctl", ["is-active", service]);
        serviceStatus[service] = stdout.trim();
      } catch {
        serviceStatus[service] = "inactive";
      }
    }

    return {
      cpuUsagePercent: Math.round(avgUsage),
      cpuCoresUsagePercent: coresUsage,
      cpuClockMhz: Math.round(cpuClock),
      memoryUsedGb: Number.parseFloat(usedMemGb.toFixed(1)),
      memoryTotalGb: Number.parseFloat(totalMemGb.toFixed(1)),
      cpuPowerW,
      basePowerEstimateW,
      estimatedSystemPowerW: cpuPowerW === null ? basePowerEstimateW : Number.parseFloat((cpuPowerW + basePowerEstimateW).toFixed(1)),
      temperatures,
      serviceStatus,
      degraded: false,
    };
  } catch (error) {
    console.error("Failed to get system metrics", error);
    return {
      cpuUsagePercent: 0,
      cpuCoresUsagePercent: [],
      cpuClockMhz: 0,
      memoryUsedGb: 0,
      memoryTotalGb: 0,
      cpuPowerW,
      basePowerEstimateW,
      estimatedSystemPowerW: cpuPowerW === null ? basePowerEstimateW : Number.parseFloat((cpuPowerW + basePowerEstimateW).toFixed(1)),
      temperatures: {},
      serviceStatus: Object.fromEntries(MONITORED_SERVICES.map((service) => [service, "unknown"])),
      degraded: true,
      degradedReason: "System metrics collection failed",
    };
  }
}

export async function getGpuStatus(): Promise<GpuStatus[]> {
  const args = [
    "--query-gpu=index,temperature.gpu,power.draw,power.limit,memory.used,memory.total,utilization.gpu",
    "--format=csv,noheader,nounits",
  ];

  try {
    const { stdout } = await runCommand("nvidia-smi", args);
    const lines = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.map((line) => {
      const [index, temp, power, limit, memUsed, memTotal, util] = line.split(",").map((value) => Number(value.trim()));
      return {
        index,
        temperatureC: temp,
        powerW: power,
        powerLimitW: limit,
        memoryUsedMiB: memUsed,
        memoryTotalMiB: memTotal,
        utilization: util,
      };
    });
  } catch {
    return [];
  }
}
