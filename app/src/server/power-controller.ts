import type { AppConfig, PowerMode } from "../shared/types.js";
import { getSystemController } from "./controller-factory.js";

const controller = getSystemController();

export async function applyPowerMode(mode: Exclude<PowerMode, "ADAPTIVE">): Promise<void> {
  await controller.applyPowerMode(mode);
}

export async function applyLowPowerEnhancements(config: AppConfig): Promise<void> {
  if (process.platform !== "linux") {
    return;
  }

  for (const service of config.lowPowerMode.stopServices) {
    if (!service || service === "unnecessary-daemons") {
      continue;
    }
    await controller.stopService(service);
  }
}

export async function startVllmService(): Promise<void> {
  await controller.startService("vllm-coder.service");
}

export async function stopVllmService(): Promise<void> {
  await controller.stopService("vllm-coder.service");
}

export async function isVllmActive(): Promise<boolean> {
  return await controller.isServiceActive("vllm-coder.service");
}
