import type { Backend } from "../api/backend";
import type { MockAppRecord, MockWindowRecord, MockElementRecord } from "./mockRuntime";
import type { WindowDebugInfo } from "../api/types";

const MOCK_DELAY_MS = 5;

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
}

function selectorMatches(
  recordSelector: { automationId?: string; name?: string; role?: string },
  automationId?: string | null,
  name?: string | null,
  role?: string | null,
): boolean {
  if (automationId && recordSelector.automationId !== automationId) return false;
  if (name && recordSelector.name !== name) return false;
  if (role && recordSelector.role !== role) return false;
  return true;
}

export class MockBackend implements Backend {
  private nextPid = 1000;
  private nextWindowHandle = 10000;
  private nextElementHandle = 100000;

  private pidToApp = new Map<number, MockAppRecord>();
  private windowHandleToWin = new Map<string, MockWindowRecord>();
  private elementHandleToEl = new Map<string, MockElementRecord>();
  private winHandleToPid = new Map<string, number>();
  private elHandleToPid = new Map<string, number>();

  ping(): string {
    return "mock";
  }

  setAppConfig(_executable: string, _classNames: string[]): void {}

  async launch(executablePath: string | null): Promise<number> {
    const pid = this.nextPid++;
    const windowId = `mock-win-${pid}`;
    const elementId = `mock-el-${pid}`;
    const winHandle = String(this.nextWindowHandle++);
    const elHandle = String(this.nextElementHandle++);

    const element: MockElementRecord = {
      id: elementId,
      selector: { automationId: "main-input", name: "Main Input", role: "textbox" },
      text: "",
    };

    const window: MockWindowRecord = {
      id: windowId,
      title: "Mock Window",
      elements: [element],
    };

    const app: MockAppRecord = {
      id: `mock-app-${pid}`,
      executablePath: executablePath ?? "mock.exe",
      title: "Mock App",
      windows: [window],
    };

    this.pidToApp.set(pid, app);
    this.windowHandleToWin.set(winHandle, window);
    this.elementHandleToEl.set(elHandle, element);
    this.winHandleToPid.set(winHandle, pid);
    this.elHandleToPid.set(elHandle, pid);

    return pid;
  }

  async enumerateWindows(processId: number): Promise<string[]> {
    await delay();
    return [...this.winHandleToPid.entries()]
      .filter(([, pid]) => pid === processId)
      .map(([handle]) => handle);
  }

  async closeApp(processId: number): Promise<void> {
    const app = this.pidToApp.get(processId);
    if (!app) return;
    for (const win of app.windows) {
      for (const el of win.elements) {
        this.removeElementMappings(el.id);
      }
      this.removeWindowMappings(win.id);
    }
    this.pidToApp.delete(processId);
    await delay();
  }

  async closeWindow(windowHandle: string): Promise<void> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return;
    for (const el of win.elements) {
      this.removeElementMappings(el.id);
    }
    const app = this.pidToApp.get(this.winHandleToPid.get(windowHandle) ?? -1);
    if (app) {
      app.windows = app.windows.filter((w) => w.id !== win.id);
    }
    this.windowHandleToWin.delete(windowHandle);
    this.winHandleToPid.delete(windowHandle);
    await delay();
  }

  isProcessRunning(processId: number): boolean {
    return this.pidToApp.has(processId);
  }

  async findElement(
    windowHandle: string,
    _classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
  ): Promise<string | null> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return null;
    const match = win.elements.find((el) =>
      selectorMatches(el.selector, automationId, name, role),
    );
    if (!match) return null;
    return this.ensureElementHandle(match);
  }

  async findElementName(windowHandle: string, name: string): Promise<string | null> {
    return this.findElement(windowHandle, null, null, name, null);
  }

  async clickElement(elementHandle: string): Promise<void> {
    if (!this.elementHandleToEl.has(elementHandle)) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    await delay();
  }

  async clickElementByName(windowHandle: string, name: string): Promise<void> {
    const handle = await this.findElementName(windowHandle, name);
    if (!handle) {
      throw new Error(`Element with name "${name}" not found in window ${windowHandle}`);
    }
    await delay();
  }

  async clickSequence(windowHandle: string, names: string[]): Promise<void> {
    for (const name of names) {
      const handle = await this.findElementName(windowHandle, name);
      if (!handle) {
        throw new Error(`Element with name "${name}" not found in clickSequence`);
      }
    }
    await delay();
  }

  async typeText(elementHandle: string, text: string): Promise<void> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    el.text = text;
    await delay();
  }

  async sendKeys(windowHandle: string, text: string): Promise<void> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) {
      throw new Error(`Window not found: ${windowHandle}`);
    }
    const textbox = win.elements.find((e) => e.selector.role === "textbox");
    if (textbox) {
      textbox.text = text;
    }
    await delay();
  }

  async getText(elementHandle: string): Promise<string> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    return el.text;
  }

  async getValue(elementHandle: string): Promise<string> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    return el.text;
  }

  async setValue(elementHandle: string, value: string): Promise<void> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    el.text = value;
    await delay();
  }

  async selectElement(elementHandle: string): Promise<void> {
    if (!this.elementHandleToEl.has(elementHandle)) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    await delay();
  }

  async toggleElement(elementHandle: string): Promise<void> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    await delay();
  }

  async getToggleState(elementHandle: string): Promise<string> {
    if (!this.elementHandleToEl.has(elementHandle)) {
      throw new Error(`Element not found: ${elementHandle}`);
    }
    return "Off";
  }

  async findAll(
    windowHandle: string,
    _classNames?: string[] | null,
    _automationId?: string | null,
    name?: string | null,
    _role?: string | null,
  ): Promise<string[]> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return [];
    if (name) {
      const matching = win.elements.filter((el) =>
        el.selector.name?.toLowerCase().includes(name.toLowerCase()),
      );
      return matching.map((el) => this.ensureElementHandle(el));
    }
    return win.elements.map((el) => this.ensureElementHandle(el));
  }

  async getParent(elementHandle: string): Promise<string | null> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) return null;
    // Find the window that contains this element
    for (const [, win] of this.windowHandleToWin) {
      if (win.elements.some((e) => e.id === el.id)) {
        // Find the app containing this window and return the first window handle
        for (const [, app] of this.pidToApp) {
          if (app.windows.some((w) => w.id === win.id)) {
            for (const [h] of this.windowHandleToWin) {
              return h;
            }
          }
        }
      }
    }
    return null;
  }

  async getChildren(elementHandle: string): Promise<string[]> {
    return [];
  }

  async getSiblings(elementHandle: string): Promise<string[]> {
    return [];
  }

  async isVisible(elementHandle: string): Promise<boolean> {
    return this.elementHandleToEl.has(elementHandle);
  }

  async isEnabled(elementHandle: string): Promise<boolean> {
    return this.elementHandleToEl.has(elementHandle);
  }

  async isFocused(elementHandle: string): Promise<boolean> {
    return false;
  }

  async getWindowBounds(windowHandle: string): Promise<{ left: number; top: number; width: number; height: number }> {
    if (!this.windowHandleToWin.has(windowHandle)) {
      throw new Error(`Window not found: ${windowHandle}`);
    }
    return { left: 100, top: 100, width: 800, height: 600 };
  }

  async setWindowBounds(_windowHandle: string, _left: number, _top: number, _width: number, _height: number): Promise<void> {
    await delay();
  }

  async maximizeWindow(_windowHandle: string): Promise<void> {
    await delay();
  }

  async minimizeWindow(_windowHandle: string): Promise<void> {
    await delay();
  }

  async restoreWindow(_windowHandle: string): Promise<void> {
    await delay();
  }

  async pressKey(_windowHandle: string, _keyCombination: string): Promise<void> {
    await delay();
  }

  async pressKeyCodes(_windowHandle: string, _keyCodes: number[]): Promise<void> {
    await delay();
  }

  debugDiscovery(processId: number): WindowDebugInfo[] {
    const app = this.pidToApp.get(processId);
    if (!app) return [];
    return app.windows.map((win) => ({
      hwnd: [...this.windowHandleToWin.entries()]
        .find(([, w]) => w.id === win.id)?.[0] ?? "0x0",
      pid: processId,
      className: "MockTopLevelClass",
      title: win.title,
      visible: true,
      ownerInvalid: false,
      matchesTargetPid: true,
      passesTopLevelVisible: true,
      processImage: app.executablePath,
    }));
  }

  private ensureElementHandle(element: MockElementRecord): string {
    for (const [handle, el] of this.elementHandleToEl) {
      if (el.id === element.id) return handle;
    }
    const handle = String(this.nextElementHandle++);
    this.elementHandleToEl.set(handle, element);
    this.elHandleToPid.set(handle, this.findPidByElementId(element.id));
    return handle;
  }

  private removeElementMappings(elId: string): void {
    for (const [handle, el] of this.elementHandleToEl) {
      if (el.id === elId) {
        this.elementHandleToEl.delete(handle);
        this.elHandleToPid.delete(handle);
        return;
      }
    }
  }

  private removeWindowMappings(winId: string): void {
    for (const [handle, win] of this.windowHandleToWin) {
      if (win.id === winId) {
        this.windowHandleToWin.delete(handle);
        this.winHandleToPid.delete(handle);
        return;
      }
    }
  }

  private findPidByElementId(elId: string): number {
    for (const [pid, app] of this.pidToApp) {
      for (const win of app.windows) {
        if (win.elements.some((e) => e.id === elId)) return pid;
      }
    }
    return -1;
  }
}
