import type { AppConfig, PowerMode } from "../shared/types.js";
import { getSystemController } from "./controller-factory.js";

const controller = getSystemController();
const VLLM_SERVICE_NAME = "vllm-coder.service";

export async function applyPowerMode(mode: Exclude<PowerMode, "ADAPTIVE">): Promise<void> {
  await controller.applyPowerMode(mode);
}

export async function applyLowPowerEnhancements(config: AppConfig): Promise<void> {
  if (process.platform !== "linux" && process.platform !== "win32") {
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
  await controller.startService(VLLM_SERVICE_NAME);
}

export async function stopVllmService(): Promise<void> {
  await controller.stopService(VLLM_SERVICE_NAME);
}

export async function isVllmActive(): Promise<boolean> {
  return await controller.isServiceActive(VLLM_SERVICE_NAME);
}
