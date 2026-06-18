import { beforeEach, describe, expect, it } from "vitest";
import { MockBackend } from "./mockBackend";
import { Window } from "../api/window";
import { AutomationEvents } from "../api/events";

function createTestWindow(backend: MockBackend, events?: AutomationEvents): Window {
  const ev = events ?? new AutomationEvents();
  return new Window("test-win", 1000, backend, ev);
}

describe("Locator", () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend();
  });

  describe("findBySelector", () => {
    it("returns null when no element matches", async () => {
      const win = createTestWindow(backend);
      const locator = win.locator({ name: "NoSuchElement" });
      const el = await locator.find();
      expect(el).toBeNull();
    });

    it("finds an element that exists", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input", role: "textbox" });
      const el = await locator.find();
      expect(el).not.toBeNull();
      expect(el!.handle).toBeTruthy();
    });

    it("waits for element with waitFor", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      const el = await locator.waitFor({ timeoutMs: 1000 });
      expect(el).not.toBeNull();
    });

    it("throws when waitFor times out", async () => {
      const win = createTestWindow(backend);
      const locator = win.locator({ name: "DoesNotExist" });
      await expect(locator.waitFor({ timeoutMs: 50, intervalMs: 10 })).rejects.toThrow(
        "Element not found after",
      );
    });
  });

  describe("actions", () => {
    it("click on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.click({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("typeText on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await locator.typeText("hello", { timeoutMs: 1000 });
      const el = await locator.find();
      expect(await el!.getText()).toBe("hello");
    });

    it("getText on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      const text = await locator.getText({ timeoutMs: 1000 });
      expect(typeof text).toBe("string");
    });

    it("exists returns true when element found", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ role: "textbox" });
      expect(await locator.exists()).toBe(true);
    });

    it("exists returns false when element not found", async () => {
      const win = createTestWindow(backend);
      const locator = win.locator({ name: "Nope" });
      expect(await locator.exists()).toBe(false);
    });

    it("hover on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.hover({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("focus on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.focus({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("clear on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.clear({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("rightClick on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.rightClick({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("doubleClick on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.doubleClick({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("isVisible and isEnabled return booleans", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      expect(typeof (await locator.isVisible())).toBe("boolean");
      expect(typeof (await locator.isEnabled())).toBe("boolean");
    });

    it("getValue on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      expect(typeof (await locator.getValue({ timeoutMs: 1000 }))).toBe("string");
    });

    it("setValue on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.setValue("new value", { timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("screenshot on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      const result = await locator.screenshot({ timeoutMs: 1000 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("select and toggle on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.select({ timeoutMs: 1000 })).resolves.toBeUndefined();
      await expect(locator.toggle({ timeoutMs: 1000 })).resolves.toBeUndefined();
    });

    it("scroll on found element", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "Main Input" });
      await expect(locator.scroll("down", 1, { timeoutMs: 1000 })).resolves.toBeUndefined();
    });
  });

  describe("chaining and filters", () => {
    it("chains .first()", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ role: "textbox" }).first();
      const el = await locator.find();
      expect(el).not.toBeNull();
    });

    it("chains .filter({ visible: true })", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ role: "textbox" }).filter({ visible: true });
      const el = await locator.find();
      expect(el).not.toBeNull();
    });

    it("filter with hasText", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ role: "textbox" }).filter({ hasText: "" });
      const el = await locator.find();
      expect(el).not.toBeNull();
    });

    it("or() adds a fallback selector", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const locator = win.locator({ name: "DoesNotExist" }).or({ name: "Main Input" });
      const el = await locator.find();
      expect(el).not.toBeNull();
    });

    it("throws from waitFor with no strategies", async () => {
      const win = createTestWindow(backend);
      const locator = new (await import("../api/locator")).Locator(
        win.handle,
        backend,
        new AutomationEvents(),
      );
      await expect(locator.waitFor({ timeoutMs: 50 })).rejects.toThrow("no strategies");
    });
  });

  describe("findFirst", () => {
    it("returns the first matching element from multiple selectors", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const el = await win.findFirst([{ name: "DoesNotExist" }, { name: "Main Input" }], {
        timeoutMs: 500,
      });
      expect(el).not.toBeNull();
    });

    it("returns null when no selector matches", async () => {
      const win = createTestWindow(backend);
      const el = await win.findFirst([{ name: "AAA" }, { name: "BBB" }], {
        timeoutMs: 50,
        intervalMs: 10,
      });
      expect(el).toBeNull();
    });

    it("sequential mode tries selectors one at a time", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const el = await win.findFirst([{ name: "DoesNotExist" }, { name: "Main Input" }], {
        timeoutMs: 500,
        parallel: false,
      });
      expect(el).not.toBeNull();
    });
  });

  describe("findImage", () => {
    it("returns a mock ImageMatch", async () => {
      const pid = await backend.launch("C:\\test.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const win = new Window(winHandle, pid, backend, new AutomationEvents());
      const match = await win.findImage([0x42, 0x4d, 0x00]);
      expect(match).not.toBeNull();
      expect(match!.confidence).toBeGreaterThan(0);
      expect(match!.x).toBeGreaterThanOrEqual(0);
      expect(match!.y).toBeGreaterThanOrEqual(0);
    });
  });
});
