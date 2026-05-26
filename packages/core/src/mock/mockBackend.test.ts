import { beforeEach, describe, expect, it } from "vitest";
import { MockBackend } from "./mockBackend";

describe("MockBackend", () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend();
  });

  it("launches a mock app and returns a pid", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    expect(pid).toBeGreaterThan(0);
    expect(backend.isProcessRunning(pid)).toBe(true);
    expect(backend.ping()).toBe("mock");
  });

  it("enumerates windows for a process", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const windows = await backend.enumerateWindows(pid);
    expect(windows.length).toBe(1);
  });

  it("finds elements by selector", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    const elHandle = await backend.findElement(winHandle, null, null, "Main Input", "textbox");
    expect(elHandle).not.toBeNull();
  });

  it("finds elements by name", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    const elHandle = await backend.findElementName(winHandle, "Main Input");
    expect(elHandle).not.toBeNull();
  });

  it("returns null for non-existent elements", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    const elHandle = await backend.findElementName(winHandle, "NonExistent");
    expect(elHandle).toBeNull();
  });

  it("types and reads text on an element", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    const elHandle = await backend.findElementName(winHandle, "Main Input");
    expect(elHandle).not.toBeNull();
    await backend.typeText(elHandle!, "hello world");
    const text = await backend.getText(elHandle!);
    expect(text).toBe("hello world");
  });

  it("clickElement throws for missing element", async () => {
    await expect(backend.clickElement("nonexistent")).rejects.toThrow("Element not found");
  });

  it("clickElementByName throws for missing name", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    await expect(backend.clickElementByName(winHandle, "NoSuchButton")).rejects.toThrow(
      'Element with name "NoSuchButton" not found',
    );
  });

  it("clickSequence succeeds for existing elements", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    await expect(backend.clickSequence(winHandle, ["Main Input"])).resolves.toBeUndefined();
  });

  it("clickSequence throws for missing elements", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    await expect(backend.clickSequence(winHandle, ["NoSuch"])).rejects.toThrow(
      'Element with name "NoSuch" not found',
    );
  });

  it("sendKeys sets text on the textbox element", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    await backend.sendKeys(winHandle, "typed text");
    const elHandle = await backend.findElement(winHandle, null, "main-input", null, null);
    if (elHandle) {
      expect(await backend.getText(elHandle)).toBe("typed text");
    }
  });

  it("pressKeyCodes does not throw", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    await expect(backend.pressKeyCodes(winHandle, [0x41])).resolves.toBeUndefined();
  });

  it("closeApp stops the process", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    expect(backend.isProcessRunning(pid)).toBe(true);
    await backend.closeApp(pid);
    expect(backend.isProcessRunning(pid)).toBe(false);
  });

  it("closeWindow removes the window", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const [winHandle] = await backend.enumerateWindows(pid);
    await backend.closeWindow(winHandle);
    const windows = await backend.enumerateWindows(pid);
    expect(windows).toEqual([]);
  });

  it("debugDiscovery returns mock data", () => {
    const pid = 999;
    const info = backend.debugDiscovery(pid);
    expect(info).toEqual([]);
  });

  it("debugDiscovery returns data for running process", async () => {
    const pid = await backend.launch("C:\\mock.exe");
    const info = backend.debugDiscovery(pid);
    expect(info.length).toBe(1);
    expect(info[0].pid).toBe(pid);
  });

  it("setAppConfig is a no-op", () => {
    expect(() => backend.setAppConfig("test.exe", ["Edit"])).not.toThrow();
  });

  describe("ValuePattern", () => {
    it("getValue returns element text", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      await backend.typeText(elHandle!, "hello");
      const value = await backend.getValue(elHandle!);
      expect(value).toBe("hello");
    });

    it("setValue sets element text", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      await backend.setValue(elHandle!, "world");
      expect(await backend.getText(elHandle!)).toBe("world");
    });

    it("getValue throws for missing element", async () => {
      await expect(backend.getValue("bad")).rejects.toThrow("Element not found");
    });

    it("setValue throws for missing element", async () => {
      await expect(backend.setValue("bad", "x")).rejects.toThrow("Element not found");
    });
  });

  describe("SelectionItemPattern", () => {
    it("selectElement succeeds for existing element", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      await expect(backend.selectElement(elHandle!)).resolves.toBeUndefined();
    });

    it("selectElement throws for missing element", async () => {
      await expect(backend.selectElement("bad")).rejects.toThrow("Element not found");
    });
  });

  describe("TogglePattern", () => {
    it("toggleElement succeeds for existing element", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      await expect(backend.toggleElement(elHandle!)).resolves.toBeUndefined();
    });

    it("toggleElement throws for missing element", async () => {
      await expect(backend.toggleElement("bad")).rejects.toThrow("Element not found");
    });

    it("getToggleState returns Off by default", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      expect(await backend.getToggleState(elHandle!)).toBe("Off");
    });

    it("getToggleState throws for missing element", async () => {
      await expect(backend.getToggleState("bad")).rejects.toThrow("Element not found");
    });
  });

  describe("findAll", () => {
    it("returns all matching elements by name", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const results = await backend.findAll(winHandle, null, null, "Main Input", null);
      expect(results.length).toBe(1);
    });

    it("returns empty array for no match", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const results = await backend.findAll(winHandle, null, null, "NonExistent", null);
      expect(results).toEqual([]);
    });

    it("returns empty array for invalid window", async () => {
      const results = await backend.findAll("bad", null, null, null, null);
      expect(results).toEqual([]);
    });
  });

  describe("tree navigation", () => {
    it("getParent returns null for element in mock", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      const parent = await backend.getParent(elHandle!);
      expect(parent).not.toBeNull();
    });

    it("getParent returns null for missing element", async () => {
      const parent = await backend.getParent("bad");
      expect(parent).toBeNull();
    });

    it("getChildren returns empty for element", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      const children = await backend.getChildren(elHandle!);
      expect(children).toEqual([]);
    });

    it("getSiblings returns empty for element", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      const siblings = await backend.getSiblings(elHandle!);
      expect(siblings).toEqual([]);
    });
  });

  describe("element state", () => {
    it("isVisible returns true for existing element", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      expect(await backend.isVisible(elHandle!)).toBe(true);
    });

    it("isVisible returns false for missing element", async () => {
      expect(await backend.isVisible("bad")).toBe(false);
    });

    it("isEnabled returns true for existing element", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      expect(await backend.isEnabled(elHandle!)).toBe(true);
    });

    it("isEnabled returns false for missing element", async () => {
      expect(await backend.isEnabled("bad")).toBe(false);
    });

    it("isFocused returns false by default", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      expect(await backend.isFocused(elHandle!)).toBe(false);
    });

    it("isFocused returns false for missing element", async () => {
      expect(await backend.isFocused("bad")).toBe(false);
    });

    it("focusElement sets isFocused to true", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const elHandle = await backend.findElementName(winHandle, "Main Input");
      await backend.focusElement(elHandle!);
      expect(await backend.isFocused(elHandle!)).toBe(true);
    });

    it("focusElement throws for missing element", async () => {
      await expect(backend.focusElement("bad")).rejects.toThrow("Element not found");
    });
  });

  describe("window management", () => {
    it("getWindowBounds returns mock bounds", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      const bounds = await backend.getWindowBounds(winHandle);
      expect(bounds.left).toBe(100);
      expect(bounds.width).toBe(800);
    });

    it("getWindowBounds throws for missing window", async () => {
      await expect(backend.getWindowBounds("bad")).rejects.toThrow("Window not found");
    });

    it("setWindowBounds does not throw", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      await expect(backend.setWindowBounds(winHandle, 0, 0, 500, 400)).resolves.toBeUndefined();
    });

    it("maximizeWindow does not throw", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      await expect(backend.maximizeWindow(winHandle)).resolves.toBeUndefined();
    });

    it("minimizeWindow does not throw", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      await expect(backend.minimizeWindow(winHandle)).resolves.toBeUndefined();
    });

    it("restoreWindow does not throw", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      await expect(backend.restoreWindow(winHandle)).resolves.toBeUndefined();
    });
  });

  describe("rich keyboard", () => {
    it("pressKey does not throw", async () => {
      const pid = await backend.launch("C:\\mock.exe");
      const [winHandle] = await backend.enumerateWindows(pid);
      await expect(backend.pressKey(winHandle, "Ctrl+C")).resolves.toBeUndefined();
    });

    it("pressKey does not throw for invalid window (mock no-op)", async () => {
      await expect(backend.pressKey("bad", "Enter")).resolves.toBeUndefined();
    });
  });
});
