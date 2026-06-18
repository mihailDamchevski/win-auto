import { FlakyHistoryStore } from "./flakyHistory";
import type { FlakyReport } from "./flakyHistory";

export type FlakyOptions = {
  /**
   * Directory for the flaky history JSON file.
   * Default: `.win-auto/flaky`
   */
  historyDir?: string;
  /**
   * Failure rate threshold (0–1) for auto-quarantine.
   * Tests exceeding this rate in the recent window are skipped.
   * Default: 0.3 (30%)
   */
  failureThreshold?: number;
  /**
   * Time window in ms for recent failure rate calculation.
   * Default: 7 days
   */
  quarantineWindowMs?: number;
  /**
   * Minimum total runs before quarantine kicks in.
   * Prevents quarantining on the first few runs.
   * Default: 5
   */
  minRuns?: number;
};

let globalStore: FlakyHistoryStore | null = null;
let globalOptions: FlakyOptions = {};

export function initFlakyTracking(options?: FlakyOptions): FlakyHistoryStore {
  globalOptions = {
    historyDir: options?.historyDir ?? ".win-auto/flaky",
    failureThreshold: options?.failureThreshold ?? 0.3,
    quarantineWindowMs: options?.quarantineWindowMs ?? 7 * 24 * 60 * 60 * 1000,
    minRuns: options?.minRuns ?? 5,
  };
  globalStore = new FlakyHistoryStore(globalOptions.historyDir);
  return globalStore;
}

export function getFlakyStore(): FlakyHistoryStore | null {
  return globalStore;
}

export function getFlakyOptions(): FlakyOptions {
  return { ...globalOptions };
}

/**
 * Record a test result. Called automatically by setup.ts hooks.
 */
export function recordFlakyResult(
  testName: string,
  passed: boolean,
  durationMs: number,
  error?: Error,
): void {
  const store = globalStore ?? initFlakyTracking();
  store.record(testName, passed, durationMs, error);
}

/**
 * Check if a test should be auto-quarantined (skipped).
 * Returns true if the test's recent failure rate exceeds the threshold.
 */
export function isTestQuarantined(testName: string): boolean {
  const store = globalStore;
  if (!store) return false;

  const threshold = globalOptions.failureThreshold ?? 0.3;
  const windowMs = globalOptions.quarantineWindowMs ?? 7 * 24 * 60 * 60 * 1000;
  const minRuns = globalOptions.minRuns ?? 5;

  const recentRecords = store.getRecords(testName, windowMs);
  if (recentRecords.length < minRuns) return false;

  const failures = recentRecords.filter((r) => !r.passed).length;
  const rate = failures / recentRecords.length;
  return rate >= threshold;
}

/**
 * Generate a flaky test report.
 */
export function generateFlakyReport(): FlakyReport {
  const store = globalStore ?? initFlakyTracking();
  return store.generateReport(globalOptions.failureThreshold);
}

/**
 * Reset the global flaky store (useful in tests).
 */
export function resetFlakyTracking(): void {
  globalStore = null;
  globalOptions = {};
}
