import { execFile } from "node:child_process";
import type { TemperatureSnapshot } from "./types.js";

function run(command: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseFirstNumber(input: string): number | null {
  const m = input.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  return Number(m[0]);
}

export async function readGpuTemps(): Promise<{ gpu0C: number; gpu1C: number }> {
  try {
    const stdout = await run("nvidia-smi", ["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"]);
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    const gpu0C = Number(lines[0] ?? 0);
    const gpu1C = Number(lines[1] ?? gpu0C);
    return { gpu0C, gpu1C };
  } catch {
    return { gpu0C: 0, gpu1C: 0 };
  }
}

export async function readCpuTemp(): Promise<number> {
  try {
    const stdout = await run("sensors", []);
    const parsed = parseFirstNumber(stdout);
    return parsed ?? 0;
  } catch {
    return 0;
  }
}

export async function readTemperatureSnapshot(): Promise<TemperatureSnapshot> {
  const [cpuC, gpus] = await Promise.all([readCpuTemp(), readGpuTemps()]);
  return { cpuC, gpu0C: gpus.gpu0C, gpu1C: gpus.gpu1C };
}
