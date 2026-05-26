import { afterEach, beforeEach, onTestFailed, describe as vitestDescribe, expect as vitestExpect } from "vitest";
import { closeTrackedApps, captureScreenshotsFromTrackedApps } from "./context";
import { it } from "./vitest";
import { loadWinAutoConfig } from "../api/config";

type GlobalTesting = typeof globalThis & {
  describe: typeof vitestDescribe;
  it: typeof it;
  expect: typeof vitestExpect;
};

// Load win-auto.config.ts and apply settings
loadWinAutoConfig().then((config) => {
  if (config?.runtime === "mock" && !process.env.WIN_AUTO_BACKEND) {
    process.env.WIN_AUTO_BACKEND = "mock";
  }
  if (config?.timeoutMs) {
    const key = "WIN_AUTO_TIMEOUT_MS" as string;
    process.env[key] = String(config.timeoutMs);
  }
}).catch(() => {
  // config not present or failed to load — use defaults
});

beforeEach(() => {
  onTestFailed(async () => {
    const files = await captureScreenshotsFromTrackedApps();
    if (files.length > 0) {
      console.log(`Screenshots saved:\n  ${files.join("\n  ")}`);
    }
  });
});

afterEach(async () => {
  await closeTrackedApps();
});

const globals = globalThis as GlobalTesting;

globals.describe = vitestDescribe;
globals.it = it;
globals.expect = vitestExpect;
