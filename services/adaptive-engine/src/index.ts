type PowerMode = "DEFAULT" | "LOW_POWER" | "STANDARD_250" | "STANDARD_280" | "ADAPTIVE";

interface StatusView {
  mode: PowerMode;
  llmReady: boolean;
  llmGatewayEnabled: boolean;
  gateway?: {
    enabled: boolean;
    idleRemainingSeconds: number;
  };
}

const backendBase = process.env.VANTAGE_BACKEND_URL ?? "http://127.0.0.1:18080";
const pollMs = Number(process.env.VANTAGE_ADAPTIVE_POLL_MS ?? 15000);

let lastAppliedMode: PowerMode | null = null;

async function getStatus(): Promise<StatusView> {
  const response = await fetch(`${backendBase}/api/status`);
  if (!response.ok) {
    throw new Error(`status fetch failed: ${response.status}`);
  }
  return (await response.json()) as StatusView;
}

async function setMode(mode: PowerMode): Promise<void> {
  const response = await fetch(`${backendBase}/api/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`set mode failed (${response.status}): ${text}`);
  }
}

async function tick(): Promise<void> {
  const status = await getStatus();

  if (!status.llmGatewayEnabled) {
    if (lastAppliedMode !== "LOW_POWER") {
      await setMode("LOW_POWER");
      lastAppliedMode = "LOW_POWER";
      console.log("[adaptive-engine] gateway disabled -> forced LOW_POWER");
    }
    return;
  }

  if (status.mode !== "ADAPTIVE") {
    await setMode("ADAPTIVE");
    lastAppliedMode = "ADAPTIVE";
    console.log("[adaptive-engine] normalized mode to ADAPTIVE");
    return;
  }

  lastAppliedMode = "ADAPTIVE";

  const remaining = status.gateway?.idleRemainingSeconds;
  if (typeof remaining === "number") {
    console.log(`[adaptive-engine] ok mode=ADAPTIVE llmReady=${status.llmReady} idleRemaining=${remaining}s`);
  } else {
    console.log(`[adaptive-engine] ok mode=ADAPTIVE llmReady=${status.llmReady}`);
  }
}

function start(): void {
  console.log(`[adaptive-engine] started poll=${pollMs}ms backend=${backendBase}`);
  void tick().catch((error) => {
    console.error("[adaptive-engine] initial tick failed", error);
  });

  setInterval(() => {
    void tick().catch((error) => {
      console.error("[adaptive-engine] tick failed", error);
    });
  }, pollMs);
}

start();
