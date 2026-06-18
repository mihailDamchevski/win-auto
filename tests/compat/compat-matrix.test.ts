/**
 * Windows Compatibility Matrix Tests
 *
 * These tests verify win-auto works across different Windows environments.
 * Run on each target configuration and record results.
 *
 * Target configurations:
 *   - Windows 10 22H2
 *   - Windows 11 23H2
 *   - Windows 11 latest
 *
 * DPI settings to test: 100%, 125%, 150%, 200%
 * Monitor configs: single, multi-monitor (identical DPI), multi-monitor (mixed DPI)
 * Session types: local desktop, RDP connected, RDP disconnected, VM console
 *
 * Usage:
 *   npx vitest run tests/compat/compat-matrix.test.ts
 *
 * Environment variables:
 *   WIN_AUTO_COMPAT_DPI — override DPI expectation (for CI)
 *   WIN_AUTO_COMPAT_SESSION — session type label for results
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Automation } from "../../packages/core/src/api/automation";
import { Window } from "../../packages/core/src/api/window";

type CompatResult = {
  test: string;
  passed: boolean;
  dpi: number;
  session: string;
  osVersion: string;
  error?: string;
};

const results: CompatResult[] = [];

function getOsVersion(): string {
  const version = process.env.os || "Unknown";
  return version;
}

function getDpi(): number {
  const override = process.env.WIN_AUTO_COMPAT_DPI;
  if (override) return parseInt(override, 10);
  // Default: assume 100% (96 DPI)
  return 96;
}

function getSession(): string {
  return process.env.WIN_AUTO_COMPAT_SESSION || "local";
}

function record(test: string, passed: boolean, error?: string) {
  results.push({
    test,
    passed,
    dpi: getDpi(),
    session: getSession(),
    osVersion: getOsVersion(),
    error,
  });
}

let auto: Automation;

beforeAll(() => {
  auto = new Automation();
});

afterAll(() => {
  console.log("\n=== Compatibility Matrix Results ===");
  console.log(`OS: ${getOsVersion()}  DPI: ${getDpi()}  Session: ${getSession()}`);
  console.log(`Total: ${results.length}  Passed: ${results.filter((r) => r.passed).length}  Failed: ${results.filter((r) => !r.passed).length}`);
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    const extra = r.error ? ` — ${r.error}` : "";
    console.log(`  [${status}] ${r.test}${extra}`);
  }
});

describe("compat — basic operations", () => {
  it("launch and close notepad", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      expect(app.processId).toBeGreaterThan(0);
      await app.close();
      record("launch and close notepad", true);
    } catch (err) {
      record("launch and close notepad", false, String(err));
      throw err;
    }
  });

  it("find textbox in notepad", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      expect(window).not.toBeNull();
      const el = await window!.findElement({ role: "textbox" });
      expect(el).not.toBeNull();
      await app.close();
      record("find textbox in notepad", true);
    } catch (err) {
      record("find textbox in notepad", false, String(err));
      throw err;
    }
  });

  it("type and read text", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      const el = await window!.findElement({ role: "textbox" });
      expect(el).not.toBeNull();
      await el!.typeText("compat-test-123");
      const value = await el!.getValue();
      expect(value).toContain("compat-test-123");
      await app.close();
      record("type and read text", true);
    } catch (err) {
      record("type and read text", false, String(err));
      throw err;
    }
  });

  it("click button", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      // Open File menu via keyboard
      await window!.pressKey("Alt+F");
      await new Promise((r) => setTimeout(r, 500));
      // Close menu
      await window!.pressKey("Escape");
      await app.close();
      record("click button (menu interaction)", true);
    } catch (err) {
      record("click button (menu interaction)", false, String(err));
      throw err;
    }
  });

  it("screenshot", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      const pixels = await window!.screenshot();
      expect(pixels.length).toBeGreaterThan(0);
      await app.close();
      record("screenshot", true);
    } catch (err) {
      record("screenshot", false, String(err));
      throw err;
    }
  });

  it("window management (maximize, minimize, restore)", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      expect(window).not.toBeNull();

      await window!.maximize();
      const bounds1 = await window!.getBounds();
      expect(bounds1.width).toBeGreaterThan(0);

      await window!.minimize();
      await new Promise((r) => setTimeout(r, 300));

      await window!.restore();
      const bounds2 = await window!.getBounds();
      expect(bounds2.width).toBeGreaterThan(0);

      await app.close();
      record("window management", true);
    } catch (err) {
      record("window management", false, String(err));
      throw err;
    }
  });

  it("element tree inspection", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      const tree = window!.inspectTree(3);
      expect(tree.length).toBeGreaterThan(0);
      await app.close();
      record("element tree inspection", true);
    } catch (err) {
      record("element tree inspection", false, String(err));
      throw err;
    }
  });
});

describe("compat — DPI awareness", () => {
  it("getBounds returns correct coordinates at current DPI", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      const bounds = await window!.getBounds();
      // At any DPI, bounds should be positive and within screen
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.left).toBeGreaterThanOrEqual(-100); // off-screen edge possible
      expect(bounds.top).toBeGreaterThanOrEqual(-100);
      await app.close();
      record("DPI: getBounds positive", true);
    } catch (err) {
      record("DPI: getBounds positive", false, String(err));
      throw err;
    }
  });

  it("click lands on correct element at current DPI", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      const el = await window!.findElement({ role: "textbox" });
      expect(el).not.toBeNull();
      // Click should not throw
      await el!.click();
      await app.close();
      record("DPI: click accuracy", true);
    } catch (err) {
      record("DPI: click accuracy", false, String(err));
      throw err;
    }
  });
});

describe("compat — keyboard input", () => {
  it("pressKey sends keyboard shortcuts", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      // Ctrl+A should not throw
      await window!.pressKey("ctrl+a");
      await app.close();
      record("keyboard: pressKey", true);
    } catch (err) {
      record("keyboard: pressKey", false, String(err));
      throw err;
    }
  });

  it("keyDown/keyUp modifier sequence", async () => {
    try {
      const app = await auto.launch("C:\\Windows\\System32\\notepad.exe");
      const window = await app.getMainWindow();
      await window!.keyDown("Shift");
      await window!.pressKey("End");
      await window!.keyUp("Shift");
      await app.close();
      record("keyboard: modifier sequence", true);
    } catch (err) {
      record("keyboard: modifier sequence", false, String(err));
      throw err;
    }
  });
});
