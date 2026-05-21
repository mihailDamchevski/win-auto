import type { Backend } from "../api/backend";
import type {
  MockAppRecord, MockWindowRecord, MockElementRecord,
} from "./mockRuntime";
import {
  createDefaultElement, createDefaultWindow, createDefaultApp,
} from "./mockRuntime";
import type {
  DialogControl, DialogInfo, ElementNode, ProcessEntry, WindowBounds, WindowDebugInfo,
} from "../api/types";

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
  private nextDialogHandle = 20000;

  private pidToApp = new Map<number, MockAppRecord>();
  private windowHandleToWin = new Map<string, MockWindowRecord>();
  private elementHandleToEl = new Map<string, MockElementRecord>();
  private winHandleToPid = new Map<string, number>();
  private elHandleToPid = new Map<string, number>();

  // --- helpers ---

  ping(): string {
    return "mock";
  }

  setAppConfig(_executable: string, _classNames: string[]): void {}

  private assertWindow(handle: string): MockWindowRecord {
    const win = this.windowHandleToWin.get(handle);
    if (!win) throw new Error(`Window not found: ${handle}`);
    return win;
  }

  private assertElement(handle: string): MockElementRecord {
    const el = this.elementHandleToEl.get(handle);
    if (!el) throw new Error(`Element not found: ${handle}`);
    return el;
  }

  private findPidByElementId(elId: string): number {
    for (const [pid, app] of this.pidToApp) {
      for (const win of app.windows) {
        if (win.elements.some((e) => e.id === elId)) return pid;
      }
    }
    return -1;
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

  /** Creates a proper handle -> record entry for an element, maintaining tree links */
  private registerElement(el: MockElementRecord, parentHandle: string | null): string {
    const handle = String(this.nextElementHandle++);
    this.elementHandleToEl.set(handle, el);
    this.elHandleToPid.set(handle, this.findPidByElementId(el.id));
    el.parentHandle = parentHandle;
    return handle;
  }

  private setFocused(handle: string): void {
    // Unfocus all elements in the same PID
    const pid = this.elHandleToPid.get(handle);
    if (pid != null) {
      for (const [h, el] of this.elementHandleToEl) {
        if (this.elHandleToPid.get(h) === pid && h !== handle) {
          el.isFocused = false;
        }
      }
    }
    this.assertElement(handle).isFocused = true;
  }

  // --- lifecycle ---

  async launch(executablePath: string | null): Promise<number> {
    const pid = this.nextPid++;
    const winId = `mock-win-${pid}`;
    const elId = `mock-el-${pid}`;
    const winHandle = String(this.nextWindowHandle++);

    const element = createDefaultElement(elId, { automationId: "main-input", name: "Main Input", role: "textbox" });
    const window = createDefaultWindow(winId, "Mock Window");
    window.elements.push(element);
    element.parentHandle = winId;

    const app = createDefaultApp(`mock-app-${pid}`, executablePath ?? "mock.exe");
    app.windows.push(window);

    this.pidToApp.set(pid, app);
    this.windowHandleToWin.set(winHandle, window);
    this.winHandleToPid.set(winHandle, pid);

    // Register element
    this.registerElement(element, winHandle);

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

  // --- element finding ---

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

  async findAll(
    windowHandle: string,
    _classNames?: string[] | null,
    _automationId?: string | null,
    name?: string | null,
    _role?: string | null,
  ): Promise<string[]> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return [];
    let matches = win.elements;
    if (name) {
      matches = matches.filter((el) =>
        el.selector.name?.toLowerCase().includes(name.toLowerCase()),
      );
    }
    return matches.map((el) => this.ensureElementHandle(el));
  }

  // --- interactions (with state tracking) ---

  async clickElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    this.setFocused(elementHandle);
    await delay();
  }

  async rightClickElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    this.setFocused(elementHandle);
    await delay();
  }

  async doubleClickElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    this.setFocused(elementHandle);
    await delay();
  }

  async hoverElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    await delay();
  }

  async clickElementByName(windowHandle: string, name: string): Promise<void> {
    const handle = await this.findElementName(windowHandle, name);
    if (!handle) {
      throw new Error(`Element with name "${name}" not found in window ${windowHandle}`);
    }
    await this.clickElement(handle);
  }

  async clickSequence(windowHandle: string, names: string[]): Promise<void> {
    for (const name of names) {
      const handle = await this.findElementName(windowHandle, name);
      if (!handle) {
        throw new Error(`Element with name "${name}" not found in clickSequence`);
      }
      await this.clickElement(handle);
    }
  }

  async typeText(elementHandle: string, text: string): Promise<void> {
    const el = this.assertElement(elementHandle);
    el.text = text;
    this.setFocused(elementHandle);
    await delay();
  }

  async sendKeys(windowHandle: string, text: string): Promise<void> {
    const win = this.assertWindow(windowHandle);
    const textbox = win.elements.find((e) => e.selector.role === "textbox");
    if (textbox) {
      textbox.text = text;
    }
    await delay();
  }

  async getText(elementHandle: string): Promise<string> {
    return this.assertElement(elementHandle).text;
  }

  async getValue(elementHandle: string): Promise<string> {
    return this.assertElement(elementHandle).text;
  }

  async setValue(elementHandle: string, value: string): Promise<void> {
    this.assertElement(elementHandle).text = value;
    await delay();
  }

  async selectElement(elementHandle: string): Promise<void> {
    const el = this.assertElement(elementHandle);
    el.isSelected = true;
    this.setFocused(elementHandle);
    await delay();
  }

  async toggleElement(elementHandle: string): Promise<void> {
    const el = this.assertElement(elementHandle);
    el.isToggled = !el.isToggled;
    el.toggleState = el.isToggled ? "On" : "Off";
    el.isSelected = true;
    await delay();
  }

  async getToggleState(elementHandle: string): Promise<string> {
    return this.assertElement(elementHandle).toggleState;
  }

  // --- tree navigation (real parent/child tracking) ---

  async getParent(elementHandle: string): Promise<string | null> {
    const el = this.assertElement(elementHandle);
    return el.parentHandle;
  }

  async getChildren(elementHandle: string): Promise<string[]> {
    const el = this.assertElement(elementHandle);
    if (el.childHandles.length > 0) {
      return el.childHandles.filter((h) => this.elementHandleToEl.has(h));
    }
    return [];
  }

  async getSiblings(elementHandle: string): Promise<string[]> {
    const el = this.assertElement(elementHandle);
    if (!el.parentHandle) return [];
    const parentId = this.windowHandleToWin.get(el.parentHandle)
      ? el.parentHandle
      : this.elementHandleToEl.get(el.parentHandle)?.id;
    if (!parentId) return [];

    // If parent is a window, siblings are other elements in that window
    const parentWin = this.windowHandleToWin.get(el.parentHandle);
    if (parentWin) {
      return parentWin.elements
        .filter((e) => e.id !== el.id)
        .map((e) => this.ensureElementHandle(e));
    }

    // If parent is an element, siblings are other children of that element
    const parentEl = this.elementHandleToEl.get(el.parentHandle);
    if (parentEl) {
      // Find the window this element belongs to, then scan for elements with same parentHandle
      const pid = this.elHandleToPid.get(elementHandle);
      if (pid == null) return [];
      const app = this.pidToApp.get(pid);
      if (!app) return [];
      const handles: string[] = [];
      for (const [, h] of this.elementHandleToEl) {
        if (h.parentHandle === el.parentHandle && h.id !== el.id) {
          const hh = this.ensureElementHandle(h);
          handles.push(hh);
        }
      }
      return handles;
    }

    return [];
  }

  // --- state queries ---

  async isVisible(elementHandle: string): Promise<boolean> {
    return this.assertElement(elementHandle).isVisible;
  }

  async isEnabled(elementHandle: string): Promise<boolean> {
    return this.assertElement(elementHandle).isEnabled;
  }

  async isFocused(elementHandle: string): Promise<boolean> {
    return this.assertElement(elementHandle).isFocused;
  }

  // --- window operations (with state tracking) ---

  async getWindowBounds(windowHandle: string): Promise<WindowBounds> {
    const win = this.assertWindow(windowHandle);
    return { ...win.bounds };
  }

  async setWindowBounds(
    windowHandle: string,
    left: number, top: number, width: number, height: number,
  ): Promise<void> {
    const win = this.assertWindow(windowHandle);
    win.bounds = { left, top, width, height };
    await delay();
  }

  async focusWindow(windowHandle: string): Promise<void> {
    const win = this.assertWindow(windowHandle);
    win.isFocused = true;
    await delay();
  }

  async maximizeWindow(windowHandle: string): Promise<void> {
    const win = this.assertWindow(windowHandle);
    win.isMaximized = true;
    win.isMinimized = false;
    await delay();
  }

  async minimizeWindow(windowHandle: string): Promise<void> {
    const win = this.assertWindow(windowHandle);
    win.isMinimized = true;
    win.isMaximized = false;
    await delay();
  }

  async restoreWindow(windowHandle: string): Promise<void> {
    const win = this.assertWindow(windowHandle);
    win.isMaximized = false;
    win.isMinimized = false;
    await delay();
  }

  // --- input ---

  async pressKey(_windowHandle: string, _keyCombination: string): Promise<void> {
    await delay();
  }

  async pressKeyCodes(_windowHandle: string, _keyCodes: number[]): Promise<void> {
    await delay();
  }

  async keyDown(_windowHandle: string, _key: string): Promise<void> {
    await delay();
  }

  async keyUp(_windowHandle: string, _key: string): Promise<void> {
    await delay();
  }

  // --- mouse ---

  async mouseMove(_x: number, _y: number): Promise<void> {
    await delay();
  }

  async scrollElement(elementHandle: string, _direction: string, _amount: number): Promise<void> {
    this.assertElement(elementHandle);
    await delay();
  }

  async dragDrop(fromElementHandle: string, toElementHandle: string): Promise<void> {
    this.assertElement(fromElementHandle);
    this.assertElement(toElementHandle);
    await delay();
  }

  // --- screenshots ---

  async captureScreenshot(elementHandle: string): Promise<number[]> {
    this.assertElement(elementHandle);
    return [0x42, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // miniature BMP header
  }

  async captureScreenshotToFile(elementHandle: string, _path: string): Promise<void> {
    this.assertElement(elementHandle);
  }

  // --- dialogs (with real tracking) ---

  findDialogs(processId: number): DialogInfo[] {
    const app = this.pidToApp.get(processId);
    if (!app) return [];
    return app.dialogs.map((d, i) => {
      const handle = String(this.nextDialogHandle + i);
      return {
        handle,
        title: d.title,
        class_name: "#32770",
        visible: true,
      };
    });
  }

  getDialogControls(windowHandle: string): DialogControl[] {
    // Find dialog by handle in all apps
    const handleNum = Number(windowHandle);
    for (const [, app] of this.pidToApp) {
      const idx = handleNum - this.nextDialogHandle;
      if (idx >= 0 && idx < app.dialogs.length) {
        return app.dialogs[idx].buttons.map((name, i) => ({
          handle: `${windowHandle}-btn-${i}`,
          name,
          control_type: "Button",
        }));
      }
    }
    return [];
  }

  async clickDialogButton(windowHandle: string, buttonText: string): Promise<void> {
    const controls = this.getDialogControls(windowHandle);
    if (!controls.some((c) => c.name === buttonText)) {
      throw new Error(`Button "${buttonText}" not found in dialog ${windowHandle}`);
    }
  }

  async setDialogFilePath(windowHandle: string, path: string): Promise<void> {
    const handleNum = Number(windowHandle);
    for (const [, app] of this.pidToApp) {
      const idx = handleNum - this.nextDialogHandle;
      if (idx >= 0 && idx < app.dialogs.length) {
        app.dialogs[idx].filePath = path;
        return;
      }
    }
  }

  // --- process management ---

  findProcessesByName(imageName: string): ProcessEntry[] {
    const results: ProcessEntry[] = [];
    for (const [pid, app] of this.pidToApp) {
      if (app.executablePath.toLowerCase().includes(imageName.toLowerCase())) {
        results.push({ pid, imageName: app.executablePath });
      }
    }
    return results;
  }

  async waitForProcessExit(processId: number, _timeoutMs: number): Promise<boolean> {
    return !this.pidToApp.has(processId);
  }

  getProcessImageName(processId: number): string {
    return this.pidToApp.get(processId)?.executablePath ?? "";
  }

  async killProcess(processId: number): Promise<void> {
    await this.closeApp(processId);
  }

  // --- attributes ---

  async getElementAttribute(elementHandle: string, attributeName: string): Promise<string> {
    const el = this.assertElement(elementHandle);
    const attr = attributeName.toLowerCase().replace(/_/g, "");
    switch (attr) {
      case "name": return el.selector.name ?? "";
      case "automationid": return el.selector.automationId ?? "";
      case "role":
      case "ariarole": return el.selector.role ?? "";
      case "isenabled": return String(el.isEnabled);
      case "isoffscreen": return String(!el.isVisible);
      case "haskeyboardfocus": return String(el.isFocused);
      case "ispassword": return "false";
      case "iscontrolelement":
      case "iscontentelement": return "true";
      case "value":
      case "text": return el.text;
      default: return "";
    }
  }

  // --- text selection ---

  async selectText(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    await delay();
  }

  async getSelection(elementHandle: string): Promise<string> {
    return this.assertElement(elementHandle).text;
  }

  async replaceSelectedText(elementHandle: string, text: string): Promise<void> {
    this.assertElement(elementHandle).text = text;
    await delay();
  }

  // --- tree inspection ---

  inspectWindowTree(windowHandle: string, _maxDepth?: number): ElementNode[] {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return [];
    return win.elements.map((el) => this.elementToNode(el, _maxDepth ?? 5));
  }

  private elementToNode(el: MockElementRecord, depth: number): ElementNode {
    const handle = this.ensureElementHandle(el);
    const children: ElementNode[] = [];
    if (depth > 0 && el.childHandles.length > 0) {
      for (const childHandle of el.childHandles) {
        const childEl = this.elementHandleToEl.get(childHandle);
        if (childEl) {
          children.push(this.elementToNode(childEl, depth - 1));
        }
      }
    }
    return {
      handle,
      name: el.selector.name ?? "",
      role: el.selector.role ?? "",
      automationId: el.selector.automationId ?? "",
      isVisible: el.isVisible,
      isEnabled: el.isEnabled,
      children,
    };
  }

  // --- debug ---

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
}
