import "./globals";

export { describe } from "./vitest";
export { it } from "./vitest";
export { expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
export {
  TestAutomation,
  trackApp,
  closeTrackedApps,
  getTrackedApps,
  captureScreenshotsFromTrackedApps,
} from "../api/testAutomation";
export { MockBackend } from "../mock/mockBackend";
export { installTestGlobals } from "./installGlobals";

// Matchers
export {
  expectElement,
  expectWindow,
  expectDialog,
  expectScreenshot,
  toBeBMP,
} from "./matchers";

// Tree snapshots
export { expectElementTree } from "./treeSnapshot";

// Fixture helpers
export { createMockFixture } from "./fixture";

// Diagnostic bundles
export { captureDiagnosticBundle } from "./diagnostics";
export { FailureBundle } from "../api/failureBundle";
export type { FailureBundleData, FailureBundleAppEntry } from "../api/failureBundle";

// Flaky test economics
export { FlakyHistoryStore } from "./flakyHistory";
export type { FlakyRecord, FlakySummary, FlakyCluster, FlakyReport, FailureMode } from "./flakyHistory";
export { initFlakyTracking, recordFlakyResult, isTestQuarantined, generateFlakyReport } from "./flaky";
export type { FlakyOptions } from "./flaky";

// Conditions & time measurement
export { isCI, isRealDesktop, measureTime, measureAsync } from "./conditions";

// Mock factories
export { createDefaultElement, createDefaultWindow, createDefaultApp } from "../mock/mockRuntime";
export type { MockElementRecord, MockWindowRecord, MockAppRecord } from "../mock/mockRuntime";
