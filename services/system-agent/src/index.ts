import express from "express";
import { spawn } from "node:child_process";

type ServiceStatus = {
  unit: string;
  active: string;
  sub: string;
  load: string;
};

const app = express();

const port = Number(process.env.VANTAGE_SYSTEM_AGENT_PORT ?? 18081);
const trackedServices = (process.env.VANTAGE_TRACKED_SERVICES ?? [
  "vantage-backend.service",
  "vantage-dashboard.service",
  "vantage-ak620-agent.service",
  "vllm-coder.service",
  "vantage-llm-gateway.service",
  "vantage-adaptive-engine.service",
  "vantage-system-agent.service",
].join(",")).split(",").map((v) => v.trim()).filter(Boolean);

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

async function getServiceStatus(unit: string): Promise<ServiceStatus> {
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vantage-system-agent" });
});

app.get("/api/services/status", async (_req, res) => {
  try {
    const statuses = await Promise.all(trackedServices.map((unit) => getServiceStatus(unit)));
    res.json({ services: statuses, count: statuses.length });
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
