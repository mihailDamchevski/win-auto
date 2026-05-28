import "./globals";

export { describe } from "vitest";
export { it } from "./vitest";
export { expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
export {
  TestAutomation,
  trackApp,
  closeTrackedApps,
  getTrackedApps,
  captureScreenshotsFromTrackedApps,
} from "../api/testAutomation";
export { installTestGlobals } from "./installGlobals";

// Matchers
export { expectElement, expectScreenshot, toBeBMP } from "./matchers";

// Conditions & time measurement
export { isCI, isRealDesktop, measureTime, measureAsync } from "./conditions";

// Mock factories
export { createDefaultElement, createDefaultWindow, createDefaultApp } from "../mock/mockRuntime";
export type { MockElementRecord, MockWindowRecord, MockAppRecord } from "../mock/mockRuntime";
