import type { ISystemController } from "@vantage/common";

export type StressTestType = "cpu" | "memory";

export interface StressTestStatus {
  isTesting: boolean;
  currentTest: {
    type: StressTestType;
    durationSeconds: number;
    startedAt: number;
    endsAt: number;
  } | null;
  lastError: string | null;
  lastFinishedAt: number | null;
}

const state: StressTestStatus = {
  isTesting: false,
  currentTest: null,
  lastError: null,
  lastFinishedAt: null,
};

export function getStressStatus(): StressTestStatus {
  if (state.isTesting && state.currentTest && Date.now() >= state.currentTest.endsAt) {
    state.isTesting = false;
    state.currentTest = null;
    state.lastFinishedAt = Date.now();
  }
  return { ...state };
}

export function startStressTest(
  controller: ISystemController,
  type: StressTestType,
  durationSeconds: number,
): { ok: true } {
  if (state.isTesting) {
    throw new Error("A stress test is already running");
  }

  const now = Date.now();
  state.isTesting = true;
  state.lastError = null;
  state.currentTest = {
    type,
    durationSeconds,
    startedAt: now,
    endsAt: now + durationSeconds * 1000,
  };
  console.log(`[stress-runner] starting ${type} stress test for ${durationSeconds}s`);

  const runner = type === "cpu"
    ? controller.runCpuStressTest(durationSeconds)
    : controller.runMemoryStressTest(durationSeconds);

  runner
    .catch((error: unknown) => {
      state.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[stress-runner] ${type} stress test failed`, state.lastError);
    })
    .finally(() => {
      state.isTesting = false;
      state.currentTest = null;
      state.lastFinishedAt = Date.now();
      console.log(`[stress-runner] finished ${type} stress test`);
    });

  return { ok: true };
}
