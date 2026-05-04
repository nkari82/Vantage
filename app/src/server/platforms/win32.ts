import { ISystemController } from "@vantage/common";
import { runCommand } from "../shell.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = process.env.VANTAGE_CONFIG_PATH ?? path.resolve(__dirname, "../../../../../config.json");

export class Win32Controller implements ISystemController {
  async restartSystem(): Promise<void> {
    await runCommand("shutdown", ["/r", "/t", "0"]);
  }
  async shutdownSystem(): Promise<void> {
    await runCommand("shutdown", ["/s", "/t", "0"]);
  }
  async applyPowerMode(mode: string): Promise<void> {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const modeConfig = config.powerModes[mode.toUpperCase()];
    
    if (!modeConfig) throw new Error(`Unknown mode: ${mode}`);

    // Windows 전원 모드 매핑 (powercfg /list 참고)
    let guid = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"; // Default/Balanced
    if (mode === "LOW_POWER") guid = "a1841308-3541-4fab-bc81-f71556f20b4a";
    else if (mode === "TURBO") guid = "381b4222-f694-41f0-9685-ff5bb260df2e";
    
    await runCommand("powercfg", ["/setactive", guid]);
  }
  async startService(serviceName: string): Promise<void> {
    await runCommand("net", ["start", serviceName]);
  }
  async stopService(serviceName: string): Promise<void> {
    await runCommand("net", ["stop", serviceName]);
  }
  async isServiceActive(serviceName: string): Promise<boolean> {
    try {
      const { stdout } = await runCommand("sc", ["query", serviceName]);
      return stdout.includes("RUNNING");
    } catch {
      return false;
    }
  }
  async runCpuStressTest(durationSeconds: number): Promise<void> {
    const cmd = `for ($i=0; $i -lt [Environment]::ProcessorCount; $i++) { Start-Job -ScriptBlock { $start = [DateTime]::Now; while (([DateTime]::Now - $start).TotalSeconds -lt ${durationSeconds}) { $x=0; $x++ } } }`;
    await runCommand("powershell", ["-Command", cmd]);
  }
  async runMemoryStressTest(durationSeconds: number): Promise<void> {
    const cmd = `$m = New-Object byte[] (1024*1024*1024*2); Start-Sleep -Seconds ${durationSeconds}`;
    await runCommand("powershell", ["-Command", cmd]);
  }
  async rebootToMemtest(): Promise<void> {
    throw new Error("Memtest86 is not supported on Windows. This feature is only available on Linux systems with GRUB.");
  }
}
