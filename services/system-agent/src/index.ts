import express from "express";
import { spawn } from "node:child_process";
import { getActualServiceName, getDefaultTrackedServices } from "@vantage/common/service-runtime";

type ServiceStatus = {
  unit: string;
  active: string;
  sub: string;
  load: string;
};

const app = express();

const port = Number(process.env.VANTAGE_SYSTEM_AGENT_PORT ?? 18081);
const trackedServices = (process.env.VANTAGE_TRACKED_SERVICES ?? getDefaultTrackedServices().join(","))
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => reject(error));

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function getLinuxServiceStatus(unit: string): Promise<ServiceStatus> {
  const output = await runCommand("/bin/systemctl", ["show", unit, "--no-page", "--property=LoadState,ActiveState,SubState"]);
  const parts = Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=")];
      }),
  );

  return {
    unit,
    load: parts.LoadState ?? "unknown",
    active: parts.ActiveState ?? "unknown",
    sub: parts.SubState ?? "unknown",
  };
}

async function getWindowsServiceStatus(unit: string): Promise<ServiceStatus> {
  const actualName = getActualServiceName(unit, "win32");
  try {
    const output = await runCommand("sc", ["query", actualName]);
    const running = /STATE\s*:\s*\d+\s+RUNNING/i.test(output);
    const stopped = /STATE\s*:\s*\d+\s+STOPPED/i.test(output);
    return {
      unit,
      load: "loaded",
      active: running ? "active" : stopped ? "inactive" : "unknown",
      sub: running ? "running" : stopped ? "stopped" : "unknown",
    };
  } catch (error) {
    return {
      unit,
      load: "not-found",
      active: "inactive",
      sub: error instanceof Error ? error.message : "query failed",
    };
  }
}

async function getServiceStatus(unit: string): Promise<ServiceStatus> {
  if (process.platform === "win32") {
    return getWindowsServiceStatus(unit);
  }
  return getLinuxServiceStatus(unit);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vantage-system-agent" });
});

app.get("/api/services/status", async (_req, res) => {
  try {
    const statuses = await Promise.all(trackedServices.map((unit) => getServiceStatus(unit)));
    res.json({ services: statuses, count: statuses.length, platform: process.platform });
  } catch (error) {
    res.status(500).json({
      error: "Failed to collect service status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, () => {
  console.log(`[system-agent] listening on ${port}`);
});
