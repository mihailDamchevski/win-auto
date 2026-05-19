import "./globals";

export { describe } from "vitest";
export { it } from "./vitest";
export { expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
export { TestAutomation, trackApp, closeTrackedApps } from "../api/testAutomation";
export { installTestGlobals } from "./installGlobals";
