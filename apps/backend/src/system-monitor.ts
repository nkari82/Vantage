import type { GpuStatus, SystemMetrics } from "./types.js";

export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    // CPU Usage (Average over all cores)
    const { stdout: mpstat } = await runCommand("mpstat", ["1", "1"]);
    const lines = mpstat.split("\n");
    const avgLine = lines.find((l) => l.includes("all"));
    const idleMatch = avgLine ? avgLine.match(/\s+(\d+\.\d+)$/) : null;
    const cpuUsage = idleMatch ? 100 - parseFloat(idleMatch[1]) : 0;

    // CPU Clock
    const { stdout: cpuInfo } = await runCommand("grep", ["cpu MHz", "/proc/cpuinfo"]);
    const clockMatch = cpuInfo.match(/cpu MHz\s+:\s+(\d+\.\d+)/);
    const cpuClock = clockMatch ? parseFloat(clockMatch[1]) : 0;

    // Memory
    const { stdout: memInfo } = await runCommand("free", ["-m"]);
    const memMatch = memInfo.match(/Mem:\s+(\d+)\s+(\d+)/);
    const totalMemGb = memMatch ? parseFloat(memMatch[1]) / 1024 : 0;
    const usedMemGb = memMatch ? parseFloat(memMatch[2]) / 1024 : 0;

    return {
      cpuUsagePercent: Math.round(cpuUsage),
      cpuClockMhz: Math.round(cpuClock),
      memoryUsedGb: parseFloat(usedMemGb.toFixed(1)),
      memoryTotalGb: parseFloat(totalMemGb.toFixed(1)),
    };
  } catch (e) {
    console.error("Failed to get system metrics", e);
    return { cpuUsagePercent: 0, cpuClockMhz: 0, memoryUsedGb: 0, memoryTotalGb: 0 };
  }
}
import { runCommand } from "./shell.js";
import type { GpuStatus } from "./types.js";

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
      const [index, temp, power, limit, memUsed, memTotal, util] = line.split(",").map((v) => Number(v.trim()));
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
