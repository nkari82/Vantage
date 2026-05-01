import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig, PowerMode } from "../shared/types.js";
import { runCommand } from "./shell.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = process.env.VANTAGE_SCRIPTS_DIR ?? path.resolve(__dirname, "../../../scripts");

const MODE_SCRIPT_MAP: Record<Exclude<PowerMode, "ADAPTIVE">, string> = {
  LOW_POWER: "vantage-power-low.sh",
  STANDARD_250: "vantage-power-standard-250.sh",
  STANDARD_280: "vantage-power-standard-280.sh",
  TURBO: "vantage-power-turbo.sh",
};

function scriptPath(scriptName: string): string {
  return path.join(SCRIPTS_DIR, scriptName);
}

export async function applyPowerMode(mode: Exclude<PowerMode, "ADAPTIVE">): Promise<void> {
  const script = scriptPath(MODE_SCRIPT_MAP[mode]);
  await runCommand("/bin/bash", [script]);
}

export async function applyLowPowerEnhancements(config: AppConfig): Promise<void> {
  for (const service of config.lowPowerMode.stopServices) {
    if (!service || service === "unnecessary-daemons") {
      continue;
    }
    await runCommand("/bin/systemctl", ["stop", service]);
  }
}

export async function startVllmService(): Promise<void> {
  await runCommand("/bin/systemctl", ["start", "vllm-coder.service"]);
}

export async function stopVllmService(): Promise<void> {
  await runCommand("/bin/systemctl", ["stop", "vllm-coder.service"]);
}

export async function isVllmActive(): Promise<boolean> {
  try {
    await runCommand("/bin/systemctl", ["is-active", "--quiet", "vllm-coder.service"]);
    return true;
  } catch {
    return false;
  }
}
