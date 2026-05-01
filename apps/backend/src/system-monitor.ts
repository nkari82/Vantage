import type { GpuStatus, SystemMetrics } from "./types.js";

export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    // CPU Usage (Average and Cores)
    const { stdout: mpstat } = await runCommand("mpstat", ["-P", "ALL", "1", "1"]);
    const lines = mpstat.split("\n");
    
    let avgUsage = 0;
    const coresUsage: number[] = [];

    for (const line of lines) {
      if (line.includes("all")) {
        const parts = line.trim().split(/\s+/);
        const idle = parseFloat(parts[parts.length - 1]);
        avgUsage = 100 - idle;
      } else if (line.match(/^\d{2}:\d{2}:\d{2}/) && !line.includes("CPU")) {
        const parts = line.trim().split(/\s+/);
        if (parts[1] !== "all") {
          const idle = parseFloat(parts[parts.length - 1]);
          coresUsage.push(Math.round(100 - idle));
        }
      }
    }

    // CPU Clock
    const { stdout: cpuInfo } = await runCommand("grep", ["cpu MHz", "/proc/cpuinfo"]);
    const clockMatch = cpuInfo.match(/cpu MHz\s+:\s+(\d+\.\d+)/);
    const cpuClock = clockMatch ? parseFloat(clockMatch[1]) : 0;

    // Memory
    const { stdout: memInfo } = await runCommand("free", ["-m"]);
    const memMatch = memInfo.match(/Mem:\s+(\d+)\s+(\d+)/);
    const totalMemGb = memMatch ? parseFloat(memMatch[1]) / 1024 : 0;
    const usedMemGb = memMatch ? parseFloat(memMatch[2]) / 1024 : 0;

    // Temperatures
    const { stdout: sensors } = await runCommand("sensors", ["-A"]);
    const temperatures: Record<string, number> = {};
    const lines = sensors.split("\n");
    for (const line of lines) {
      const match = line.match(/^(.+?):\s+\+(\d+\.\d+)°C/);
      if (match) {
        temperatures[match[1].trim().replace(/\s+/g, "_")] = parseFloat(match[2]);
      }
    }

    // 서비스 헬스 상태 확인
    const services = [
      "vantage-backend",
      "vantage-llm-gateway",
      "vllm-coder",
      "vantage-ak620-agent",
      "vantage-dashboard",
    ];
    const serviceStatus: Record<string, string> = {};
    for (const service of services) {
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
      memoryUsedGb: parseFloat(usedMemGb.toFixed(1)),
      memoryTotalGb: parseFloat(totalMemGb.toFixed(1)),
      temperatures,
      serviceStatus,
    };
  } catch (e) {
    console.error("Failed to get system metrics", e);
    return { cpuUsagePercent: 0, cpuCoresUsagePercent: [], cpuClockMhz: 0, memoryUsedGb: 0, memoryTotalGb: 0, temperatures: {} };
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
