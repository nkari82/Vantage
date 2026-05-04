import { ISystemController } from "@vantage/common";
import { Win32Controller } from "./platforms/win32.js";
import { LinuxController } from "./platforms/linux.js";
import os from "node:os";

export function getSystemController(): ISystemController {
  const platform = os.platform();
  if (platform === "win32") {
    return new Win32Controller();
  }
  return new LinuxController();
}
