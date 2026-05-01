import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openAk620Device } from "./device.js";
import { DisplayCycle } from "./display-cycle.js";
import { readTemperatureSnapshot } from "./sensors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_CONFIG_PATH = process.env.VANTAGE_CONFIG_PATH ?? path.resolve(__dirname, "../../../apps/backend/config.json");

function loadRefreshInterval(): number {
  const env = process.env.AK620_REFRESH_INTERVAL;
  if (env) {
    const v = Number(env);
    if (Number.isFinite(v) && v >= 1 && v <= 60) {
      return v;
    }
  }

  try {
    const raw = fs.readFileSync(BACKEND_CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw) as { ak620?: { refreshIntervalSeconds?: number } };
    const v = cfg.ak620?.refreshIntervalSeconds ?? 4;
    return Math.min(60, Math.max(1, Number(v)));
  } catch {
    return 4;
  }
}

async function main(): Promise<void> {
  const refreshIntervalSeconds = loadRefreshInterval();
  const device = await openAk620Device();
  const cycle = new DisplayCycle();

  // eslint-disable-next-line no-console
  console.log(`[ak620-agent] started interval=${refreshIntervalSeconds}s connected=${Boolean(device)}`);

  setInterval(async () => {
    const temps = await readTemperatureSnapshot();
    const state = cycle.update(device, temps, refreshIntervalSeconds);
    // eslint-disable-next-line no-console
    console.log(`[ak620-agent] ${state.currentTarget} ${state.temperatureC}C connected=${state.connected}`);
  }, refreshIntervalSeconds * 1000);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[ak620-agent] fatal", error);
  process.exit(1);
});
