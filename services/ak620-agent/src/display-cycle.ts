import { buildDisplayPacket } from "./protocol.js";
import type { Ak620State, DisplayTarget, TemperatureSnapshot } from "./types.js";
import type { HidDeviceAdapter } from "./device.js";

const TARGETS: DisplayTarget[] = ["CPU", "GPU0", "GPU1"];

export class DisplayCycle {
  private idx = 0;

  nextTarget(): DisplayTarget {
    const target = TARGETS[this.idx];
    this.idx = (this.idx + 1) % TARGETS.length;
    return target;
  }

  update(device: HidDeviceAdapter | null, temps: TemperatureSnapshot, refreshIntervalSeconds: number): Ak620State {
    const currentTarget = this.nextTarget();
    const temperatureC =
      currentTarget === "CPU" ? temps.cpuC : currentTarget === "GPU0" ? temps.gpu0C : temps.gpu1C;

    const packet = buildDisplayPacket(currentTarget, temperatureC);
    if (device) {
      try {
        device.write(packet);
      } catch {
        // Keep loop alive even if write fails.
      }
    }

    return {
      connected: Boolean(device),
      currentTarget,
      barLevel: currentTarget === "CPU" ? 1 : currentTarget === "GPU0" ? 2 : 3,
      temperatureC,
      refreshIntervalSeconds,
    };
  }
}
