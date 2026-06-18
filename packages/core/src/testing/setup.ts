import {
  afterEach,
  beforeEach,
  onTestFailed,
  expect as vitestExpect,
} from "vitest";
import { closeTrackedApps } from "./context";
import { captureDiagnosticBundle } from "./diagnostics";
import { describe, it } from "./vitest";
import { loadWinAutoConfig } from "../api/config";
import { getCurrentTraceRecorder } from "../api/trace";

type GlobalTesting = typeof globalThis & {
  describe: typeof describe;
  it: typeof it;
  expect: typeof vitestExpect;
};

// Load win-auto.config.ts and apply settings
loadWinAutoConfig()
  .then((config) => {
    if (config?.runtime === "mock" && !process.env.WIN_AUTO_BACKEND) {
      process.env.WIN_AUTO_BACKEND = "mock";
    }
    if (config?.timeoutMs) {
      const key = "WIN_AUTO_TIMEOUT_MS" as string;
      process.env[key] = String(config.timeoutMs);
    }
    if (config?.retryOnStale !== undefined) {
      process.env.WIN_AUTO_RETRY_ON_STALE = String(config.retryOnStale);
    }
  })
  .catch(() => {
    // config not present or failed to load — use defaults
  });

beforeEach(() => {
  onTestFailed(async () => {
    const state = (globalThis as Record<string, unknown>).__vitest_state__ as
      | { currentTestName?: string }
      | undefined;
    const testName = state?.currentTestName ?? "unknown-test";
    const bundle = await captureDiagnosticBundle(testName, "diagnostics", getCurrentTraceRecorder());
    console.log(`\n=== Diagnostic Bundle ===`);
    console.log(`Test: ${bundle.testFailed}`);
    console.log(`Apps: ${bundle.summary.totalApps}`);
    console.log(`Screenshots: ${bundle.summary.totalScreenshots}`);
    console.log(`Heap: ${bundle.summary.heapUsedMB}MB`);
    for (const entry of bundle.entries) {
      console.log(`  [${entry.pid}] ${entry.app} — window: ${entry.windowTitle ?? "N/A"}`);
      if (entry.elementTree) {
        const lines = entry.elementTree.split("\n").slice(0, 20);
        console.log(`    Element tree (${lines.length} lines):`);
        for (const line of lines) {
          console.log(`      ${line}`);
        }
      }
    }
    if (bundle.trace) {
      console.log(`Trace: ${bundle.trace.entryCount} entries over ${((bundle.trace.endTime ?? bundle.trace.startTime) - bundle.trace.startTime)}ms`);
    }
    console.log(`Bundle saved: diagnostics/\n`);
  });
});

afterEach(async () => {
  await closeTrackedApps();
});

const globals = globalThis as GlobalTesting;

globals.describe = describe;
globals.it = it;
globals.expect = vitestExpect;
