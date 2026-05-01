export type DisplayTarget = "CPU" | "GPU0" | "GPU1";

export interface TemperatureSnapshot {
  cpuC: number;
  gpu0C: number;
  gpu1C: number;
}

export interface Ak620State {
  connected: boolean;
  currentTarget: DisplayTarget;
  barLevel: 1 | 2 | 3;
  temperatureC: number;
  refreshIntervalSeconds: number;
}
