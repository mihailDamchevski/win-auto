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
import { initFlakyTracking, recordFlakyResult } from "./flaky";

type GlobalTesting = typeof globalThis & {
  describe: typeof describe;
  it: typeof it;
  expect: typeof vitestExpect;
  __vitest_state__?: { currentTestName?: string; error?: Error };
  __win_auto_start_time?: number;
  __win_auto_test_failed?: boolean;
  __win_auto_test_error?: Error;
  __win_auto_test_name?: string;
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
    // Initialize flaky tracking
    initFlakyTracking({
      historyDir: config?.flakyHistoryDir,
      failureThreshold: config?.flakyThreshold,
      minRuns: config?.flakyMinRuns,
    });
  })
  .catch(() => {
    // config not present or failed to load — use defaults
    initFlakyTracking();
  });

const g = globalThis as GlobalTesting;

beforeEach(() => {
  g.__win_auto_start_time = performance.now();
  g.__win_auto_test_failed = false;
  g.__win_auto_test_error = undefined;

  const state = g.__vitest_state__ as
    | { currentTestName?: string }
    | undefined;
  g.__win_auto_test_name = state?.currentTestName;

  onTestFailed(async () => {
    g.__win_auto_test_failed = true;
    const state = g.__vitest_state__ as
      | { currentTestName?: string; error?: Error }
      | undefined;
    const testName = state?.currentTestName ?? "unknown-test";
    const testError = state?.error;
    g.__win_auto_test_error = testError;
    const bundle = await captureDiagnosticBundle(testName, "diagnostics", getCurrentTraceRecorder(), testError);
    console.log(`\n=== Diagnostic Bundle ===`);
    console.log(`Test: ${bundle.testFailed}`);
    console.log(`Apps: ${bundle.summary.totalApps}`);
    console.log(`Screenshots: ${bundle.summary.totalScreenshots}`);
    console.log(`Heap: ${bundle.summary.heapUsedMB}MB`);
    if (bundle.error) {
      console.log(`Error: ${bundle.error.name}: ${bundle.error.message}`);
    }
    if (bundle.timingBreakdown) {
      const cats = Object.entries(bundle.timingBreakdown)
        .map(([k, v]) => `${k}=${v.totalMs}ms`)
        .join(", ");
      console.log(`Timing: ${cats}`);
    }
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
      if (bundle.trace.errors && bundle.trace.errors.length > 0) {
        console.log(`Errors in trace: ${bundle.trace.errors.length}`);
      }
      if (bundle.trace.locatorDecisions && bundle.trace.locatorDecisions.length > 0) {
        console.log(`Locator decisions: ${bundle.trace.locatorDecisions.length}`);
      }
    }
    console.log(`Bundle saved: diagnostics/\n`);
  });
});

afterEach(async () => {
  const startTime = g.__win_auto_start_time ?? performance.now();
  const durationMs = performance.now() - startTime;
  const testName = g.__win_auto_test_name ?? "unknown-test";
  const passed = !g.__win_auto_test_failed;
  const error = g.__win_auto_test_error;

  recordFlakyResult(testName, passed, Math.round(durationMs), error);
  await closeTrackedApps();
});

const globals = globalThis as GlobalTesting;

globals.describe = describe;
globals.it = it;
globals.expect = vitestExpect;
