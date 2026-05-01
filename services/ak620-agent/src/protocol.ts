import type { DisplayTarget } from "./types.js";

// Placeholder packet format: replace with exact DeepCool protocol when available.
// Keeps architecture ready while preserving safe fallback behavior.
export function buildDisplayPacket(target: DisplayTarget, tempC: number): number[] {
  const barLevel = target === "CPU" ? 1 : target === "GPU0" ? 2 : 3;
  const safeTemp = Math.max(0, Math.min(99, Math.round(tempC)));
  return [0xAA, 0x55, barLevel, safeTemp, 0x00, 0x00, 0x0D, 0x0A];
}
