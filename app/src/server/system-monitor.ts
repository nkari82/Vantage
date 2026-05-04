import si from "systeminformation";
import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./shell.js";
import { loadConfig } from "./config.js";
import type { GpuStatus, SystemMetrics } from "../shared/types.js";

export const MONITORED_SERVICES = [
  "vantage-backend.service",
  "vantage-llm-gateway.service",
  "vllm-coder.service",
  "vantage-ak620-agent.service",
] as const;

const POWER_CAP_ROOT = "/sys/class/powercap";
const DEFAULT_BASE_SYSTEM_POWER_W = 55;
const DEFAULT_CPU_IDLE_POWER_W = 15;
const DEFAULT_CPU_MAX_POWER_W = 100;
let lastRaplSample: { energyMicroJoules: number; timestampMs: number } | null = null;
let hasLoggedNvidiaSmiFailure = false;

function getBasePowerEstimateW(): number {
  const configBasePower = (() => {
    try {
      return loadConfig().powerTracking.basePowerEstimateW;
    } catch {
      return undefined;
    }
  })();
  const parsed = Number(process.env.VANTAGE_BASE_SYSTEM_POWER_W ?? configBasePower ?? DEFAULT_BASE_SYSTEM_POWER_W);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BASE_SYSTEM_POWER_W;
  }

  return Math.min(Math.max(parsed, 0), 500);
}

function readCpuPackageEnergyMicroJoules(): number | null {
  const hwmonPath = "/sys/class/hwmon";
  if (!fs.existsSync(hwmonPath)) {
    return null;
  }

  const hwmonDirs = fs.readdirSync(hwmonPath);
  for (const dir of hwmonDirs) {
    const namePath = path.join(hwmonPath, dir, "name");
    if (!fs.existsSync(namePath)) continue;
    // const driverName = fs.readFileSync(namePath, "utf8").trim();
  }

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

function sampleCpuPowerW(cpuUsagePercent: number): number | null {
  if (cpuUsagePercent === null || cpuUsagePercent === undefined) {
    return null;
  }

  const estimatedCpuPowerW = DEFAULT_CPU_IDLE_POWER_W + (cpuUsagePercent / 100) * (DEFAULT_CPU_MAX_POWER_W - DEFAULT_CPU_IDLE_POWER_W);
  return Math.round(estimatedCpuPowerW);
}

function sampleRaplCpuPowerW(): number | null {
  const energyMicroJoules = readCpuPackageEnergyMicroJoules();
  if (energyMicroJoules === null) {
    lastRaplSample = null;
    return null;
  }

  const now = Date.now();
  if (!lastRaplSample) {
    lastRaplSample = { energyMicroJoules, timestampMs: now };
    return null;
  }

  const elapsedSeconds = (now - lastRaplSample.timestampMs) / 1000;
  const deltaMicroJoules = energyMicroJoules - lastRaplSample.energyMicroJoules;
  lastRaplSample = { energyMicroJoules, timestampMs: now };

  if (elapsedSeconds <= 0 || deltaMicroJoules <= 0) {
    return null;
  }

  const watts = deltaMicroJoules / 1_000_000 / elapsedSeconds;
  if (!Number.isFinite(watts)) {
    return null;
  }

  return Number.parseFloat(watts.toFixed(1));
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
  let cpuPowerW: number | null = null;
  let cpuUsagePercent: any = 0;

  try {
    // CPU 정보 수집 (systeminformation 활용)
    const load = await si.currentLoad();
    const cpu = await si.cpu();
    const temp = await si.cpuTemperature();

    cpuUsagePercent = Number(load.currentLoad);
    cpuPowerW = sampleRaplCpuPowerW() ?? sampleCpuPowerW(cpuUsagePercent as number);
    const cpuClock = cpu.speed ? Number.parseFloat(String(cpu.speed)) * 1000 : 0; // GHz to MHz
    const coresUsage = load.cpus.map(c => Math.round(c.load));

    const mem = await si.mem();
    const memLayout = await si.memLayout();
    const installedGb = memLayout.reduce((sum, m) => sum + (m.size / 1024 / 1024 / 1024), 0);
    const avgClock = memLayout.length > 0 
      ? Math.round(memLayout.reduce((sum, m) => sum + (m.clockSpeed || 0), 0) / memLayout.length)
      : 0;
      
    const fs = await si.fsSize();
    const net = await si.networkStats();
    const os = await si.osInfo();
    const time = si.time();

    const storage = fs.map(f => ({
        mount: f.mount,
        sizeGb: Number.parseFloat((f.size / 1024 / 1024 / 1024).toFixed(1)),
        usedGb: Number.parseFloat((f.used / 1024 / 1024 / 1024).toFixed(1)),
        usePercent: f.use
    }));

    const network = net.map(n => ({
        interface: n.iface,
        rxSec: n.rx_sec ?? 0,
        txSec: n.tx_sec ?? 0
    }));

    const osMetrics = {
        distro: os.distro,
        kernel: os.kernel,
        uptime: time.uptime
    };

    // CPU/전체 온도 정보 수집 (systeminformation 활용)
    const temperatures: Record<string, number> = {};
    if (temp.main !== null) temperatures["cpu_package"] = temp.main;
    if (temp.cores) {
      temp.cores.forEach((t, i) => temperatures[`core_${i}`] = t);
    }
    
    const serviceStatus: Record<string, string> = {};
    try {
      const serviceList = await si.services(MONITORED_SERVICES.join(","));
      for (const service of serviceList) {
        serviceStatus[service.name] = service.running ? "active" : "inactive";
      }
    } catch {
      for (const serviceName of MONITORED_SERVICES) {
        serviceStatus[serviceName] = "inactive";
      }
    }

    return {
      cpuUsagePercent: Math.round(cpuUsagePercent),
      cpuCoresUsagePercent: coresUsage,
      cpuClockMhz: Math.round(cpuClock),
      memoryUsedGb: Number.parseFloat((mem.used / 1024 / 1024 / 1024).toFixed(1)),
      memoryTotalGb: Number.parseFloat((mem.total / 1024 / 1024 / 1024).toFixed(1)),
      memoryInstalledGb: Number.parseFloat(installedGb.toFixed(1)),
      memoryClockMhz: avgClock,
      storage,
      network,
      os: osMetrics,
      cpuPowerW,
      basePowerEstimateW,
      estimatedSystemPowerW: cpuPowerW === null ? basePowerEstimateW : Number.parseFloat((cpuPowerW + basePowerEstimateW).toFixed(1)),
      temperatures,
      serviceStatus,
      degraded: false,
    };
  } catch (error) {
    console.error("Failed to get system metrics", error);
    cpuPowerW = 0;
    return {
      cpuUsagePercent: 0,
      cpuCoresUsagePercent: [],
      cpuClockMhz: 0,
      memoryUsedGb: 0,
      memoryTotalGb: 0,
      memoryInstalledGb: 0,
      memoryClockMhz: 0,
      storage: [],
      network: [],
      os: { distro: "unknown", kernel: "unknown", uptime: 0 },
      cpuPowerW,
      basePowerEstimateW,
      estimatedSystemPowerW: Number.parseFloat((cpuPowerW + basePowerEstimateW).toFixed(1)),
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
  } catch (error) {
    if (!hasLoggedNvidiaSmiFailure) {
      hasLoggedNvidiaSmiFailure = true;
      console.warn("[system-monitor] nvidia-smi unavailable; GPU telemetry disabled", error instanceof Error ? error.message : error);
    }
    return [];
  }
}
