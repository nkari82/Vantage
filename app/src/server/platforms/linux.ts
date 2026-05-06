import { ISystemController } from "@vantage/common";
import { runCommand } from "../shell.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = process.env.VANTAGE_CONFIG_PATH ?? path.resolve(__dirname, "../../../../../config.json");

export class LinuxController implements ISystemController {
  async restartSystem(): Promise<void> {
    await runCommand("/bin/systemctl", ["reboot"]);
  }
  async shutdownSystem(): Promise<void> {
    await runCommand("/bin/systemctl", ["poweroff"]);
  }
  async applyPowerMode(mode: string): Promise<void> {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const modeConfig = config.powerModes[mode.toUpperCase()];
    
    if (!modeConfig) throw new Error(`Unknown mode: ${mode}`);

    if (modeConfig.gpuPowerLimitW) {
      await runCommand("nvidia-smi", ["-pm", "1"]);
      await runCommand("nvidia-smi", ["-pl", modeConfig.gpuPowerLimitW.toString()]);
    }
    
    if (modeConfig.cpuGovernor) {
      const cpus = fs.readdirSync("/sys/devices/system/cpu/");
      for (const cpu of cpus) {
        if (cpu.startsWith("cpu")) {
          const govPath = `/sys/devices/system/cpu/${cpu}/cpufreq/scaling_governor`;
          if (fs.existsSync(govPath)) {
            fs.writeFileSync(govPath, modeConfig.cpuGovernor);
          }
        }
      }
    }
  }
  async startService(serviceName: string): Promise<void> {
    await runCommand("/bin/systemctl", ["start", serviceName]);
  }
  async stopService(serviceName: string): Promise<void> {
    await runCommand("/bin/systemctl", ["stop", serviceName]);
  }
  async isServiceActive(serviceName: string): Promise<boolean> {
    try {
      await runCommand("/bin/systemctl", ["is-active", "--quiet", serviceName]);
      return true;
    } catch {
      return false;
    }
  }
  async runCpuStressTest(durationSeconds: number): Promise<void> {
    await runCommand("stress-ng", ["--cpu", "0", "--timeout", `${durationSeconds}s`]);
  }
  async runMemoryStressTest(durationSeconds: number): Promise<void> {
    await runCommand("stress-ng", ["--vm", "1", "--vm-bytes", "80%", "--timeout", `${durationSeconds}s`]);
  }

  async rebootToMemtest(): Promise<void> {
    // 1. GRUB에서 memtest86 항목 ID 조회 (보통 'memtest86' 또는 유사한 이름)
    const { stdout } = await runCommand("grep", ["-i", "memtest", "/boot/grub/grub.cfg"]);
    const match = stdout.match(/menuentry\s+['"]([^'"]*(memtest86|memtest)[^'"]*)['"]/i);
    
    if (!match) {
      throw new Error("Memtest86 entry not found in GRUB menu");
    }
    
    // 2. grub-reboot으로 다음 부팅 시 Memtest86 선택 (1회성)
    await runCommand("sudo", ["/usr/sbin/grub-reboot", match[1]]);
    
    // 3. 시스템 재부팅
    await runCommand("/bin/systemctl", ["reboot"]);
  }
}
