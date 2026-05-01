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
