import type { Backend, WinEventInfo } from "../api/backend";
import type {
  MockAppRecord,
  MockWindowRecord,
  MockElementRecord,
  MockTreeElement,
} from "./mockRuntime";
import { createDefaultElement, createDefaultWindow, createDefaultApp } from "./mockRuntime";
import type {
  DialogControl,
  DialogInfo,
  ElementNode,
  ElementPathStep,
  HwndNode,
  ImageMatch,
  MatchMode,
  ProcessEntry,
  WindowBounds,
  WindowDebugInfo,
} from "../api/types";
import { AutomationError } from "../api/errors";

const MOCK_DELAY_MS = 5;

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
}

function matchesValue(
  actual: string | undefined,
  query: string | null | undefined,
  mode: MatchMode | undefined | null,
): boolean {
  if (query == null || query === "") return true;
  if (actual == null) return false;
  const m = mode ?? "substring";
  switch (m) {
    case "exact":
      return actual === query;
    case "regex":
      try {
        return new RegExp(query, "i").test(actual);
      } catch {
        return false;
      }
    case "substring":
    default:
      return actual.toLowerCase().includes(query.toLowerCase());
  }
}

function classNamesMatch(
  elementClassName: string | undefined,
  classNames?: string[] | null,
): boolean {
  if (!classNames || classNames.length === 0) return true;
  // Elements with unknown class name always pass (native backend only
  // uses classNames as an HWND pre-filter, not a mandatory UIA constraint)
  if (!elementClassName) return true;
  return classNames.some((cn) => cn.toLowerCase() === elementClassName.toLowerCase());
}

function selectorMatches(
  recordSelector: {
    automationId?: string;
    name?: string;
    role?: string;
    className?: string;
    text?: string;
  },
  automationId?: string | null,
  name?: string | null,
  role?: string | null,
  className?: string | null,
  _text?: string | null,
  matchMode?: MatchMode | string | null,
): boolean {
  if (
    !matchesValue(
      recordSelector.automationId,
      automationId,
      matchMode as MatchMode | undefined | null,
    )
  )
    return false;
  if (!matchesValue(recordSelector.name, name, matchMode as MatchMode | undefined | null))
    return false;
  if (!matchesValue(recordSelector.role, role, matchMode as MatchMode | undefined | null))
    return false;
  if (!matchesValue(recordSelector.className, className, matchMode as MatchMode | undefined | null))
    return false;
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
    if (!win) throw new AutomationError(`Window not found: ${handle}`);
    return win;
  }

  private assertElement(handle: string): MockElementRecord {
    const el = this.elementHandleToEl.get(handle);
    if (!el) throw new AutomationError(`Element not found: ${handle}`);
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

  /** Add a child element to a parent element (for building element trees) */
  public addChildElement(
    parentHandle: string,
    selector: {
      automationId?: string;
      name?: string;
      role?: string;
      className?: string;
      text?: string;
    },
    elementId?: string,
  ): string {
    const parentEl = this.elementHandleToEl.get(parentHandle);
    if (!parentEl) {
      throw new AutomationError(`Parent element not found: ${parentHandle}`);
    }

    const childId = elementId ?? `mock-el-child-${this.nextElementHandle}`;
    const childEl: MockElementRecord = {
      id: childId,
      selector: { automationId: "child-input", name: "Child Input", role: "textbox", ...selector },
      text: "",
      isSelected: false,
      isToggled: false,
      toggleState: "Off",
      isVisible: true,
      isEnabled: true,
      isFocused: false,
      parentHandle: parentHandle,
      childHandles: [],
    };

    const childHandle = this.registerElement(childEl, parentHandle);
    parentEl.childHandles.push(childHandle);

    // Find which window owns the parent, add the child to its element list
    for (const [, win] of this.windowHandleToWin) {
      if (win.elements.some((e) => e.id === parentEl.id)) {
        win.elements.push(childEl);
        break;
      }
    }

    return childHandle;
  }

  /** Add a child window to an app (for multi-window tests) */
  public addWindow(processId: number, title?: string, windowId?: string): string {
    const app = this.pidToApp.get(processId);
    if (!app) {
      throw new AutomationError(`App not found: ${processId}`);
    }

    const winId = windowId ?? `mock-win-child-${this.nextWindowHandle}`;
    const winHandle = String(this.nextWindowHandle++);
    const window = createDefaultWindow(winId, title ?? "Child Window");
    const element = createDefaultElement(`mock-el-child-win-${this.nextElementHandle}`, {
      automationId: "default-input",
      name: "Default Input",
      role: "textbox",
    });
    element.parentHandle = winId;
    window.elements.push(element);

    app.windows.push(window);
    this.windowHandleToWin.set(winHandle, window);
    this.winHandleToPid.set(winHandle, processId);
    this.registerElement(element, winHandle);

    return winHandle;
  }

  /** Setup a complete element tree for testing. Returns the root window handle. */
  public setupElementTree(processId: number, tree: MockTreeElement, windowTitle?: string): string {
    const app = this.pidToApp.get(processId);
    if (!app) {
      throw new AutomationError(`App not found: ${processId}`);
    }

    const winId = `mock-win-tree-${this.nextWindowHandle}`;
    const winHandle = String(this.nextWindowHandle++);
    const window = createDefaultWindow(winId, windowTitle ?? "Tree Window");
    this.windowHandleToWin.set(winHandle, window);
    this.winHandleToPid.set(winHandle, processId);

    const buildTree = (node: MockTreeElement, parentHandle: string | null): string => {
      const elId = node.id ?? `mock-el-${this.nextElementHandle}`;
      const el: MockElementRecord = {
        id: elId,
        selector: {
          automationId: node.automationId ?? null!,
          name: node.name ?? null!,
          role: node.role ?? null!,
          className: node.className ?? null!,
          text: node.text ?? null!,
        },
        text: node.text ?? "",
        isSelected: false,
        isToggled: false,
        toggleState: "Off",
        isVisible: node.visible ?? true,
        isEnabled: node.enabled ?? true,
        isFocused: false,
        parentHandle: parentHandle,
        childHandles: [],
      };
      // Clean up nulls from selector
      el.selector = {
        ...(node.automationId ? { automationId: node.automationId } : {}),
        ...(node.name ? { name: node.name } : {}),
        ...(node.role ? { role: node.role } : {}),
        ...(node.className ? { className: node.className } : {}),
        ...(node.text ? { text: node.text } : {}),
      };
      const handle = this.registerElement(el, parentHandle);
      window.elements.push(el);

      if (node.children) {
        for (const child of node.children) {
          const childHandle = buildTree(child, handle);
          el.childHandles.push(childHandle);
        }
      }

      return handle;
    };

    buildTree(tree, null);
    app.windows.push(window);

    return winHandle;
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

  async launch(executablePath: string | null, _classNames?: string[] | null): Promise<number> {
    const pid = this.nextPid++;
    const winId = `mock-win-${pid}`;
    const elId = `mock-el-${pid}`;
    const winHandle = String(this.nextWindowHandle++);

    const element = createDefaultElement(elId, {
      automationId: "main-input",
      name: "Main Input",
      role: "textbox",
    });
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

  async launchProcess(
    _executablePath: string,
    _options?: { args?: string[]; cwd?: string; env?: string[] },
  ): Promise<number> {
    return 0;
  }

  async enumerateWindows(processId: number, executable?: string | null): Promise<string[]> {
    await delay();
    const app = this.pidToApp.get(processId);
    if (executable && app) {
      const exeLower = executable.toLowerCase();
      const appExeLower = app.executablePath.toLowerCase();
      if (!appExeLower.includes(exeLower) && !exeLower.includes(appExeLower)) {
        return [];
      }
    }
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
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
    className?: string | null,
    text?: string | null,
    matchMode?: string | null,
  ): Promise<string | null> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return null;
    const match = win.elements.find(
      (el) =>
        classNamesMatch(el.selector.className, classNames) &&
        selectorMatches(el.selector, automationId, name, role, className, text, matchMode),
    );
    if (!match) return null;
    return this.ensureElementHandle(match);
  }

  async findElementName(windowHandle: string, name: string): Promise<string | null> {
    return this.findElement(windowHandle, null, null, name, null);
  }

  async findAll(
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
    className?: string | null,
    text?: string | null,
    matchMode?: string | null,
  ): Promise<string[]> {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return [];
    let matches = win.elements;
    if (classNames || automationId || name || role || className || text) {
      matches = matches.filter((el) => {
        const r1 = classNamesMatch(el.selector.className, classNames);
        if (!r1) return false;
        if (automationId || name || role || className || text) {
          const r2 = selectorMatches(
            el.selector,
            automationId,
            name,
            role,
            className,
            text,
            matchMode,
          );
          return r2;
        }
        return true;
      });
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
      throw new AutomationError(`Element with name "${name}" not found in window ${windowHandle}`);
    }
    await this.clickElement(handle);
  }

  async clickSequence(windowHandle: string, names: string[]): Promise<void> {
    for (const name of names) {
      const handle = await this.findElementName(windowHandle, name);
      if (!handle) {
        throw new AutomationError(`Element with name "${name}" not found in clickSequence`);
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
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) return null;
    return el.parentHandle;
  }

  async getChildren(elementHandle: string): Promise<string[]> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) return [];
    if (el.childHandles.length > 0) {
      return el.childHandles.filter((h) => this.elementHandleToEl.has(h));
    }
    return [];
  }

  async getSiblings(elementHandle: string): Promise<string[]> {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el || !el.parentHandle) return [];
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
    const el = this.elementHandleToEl.get(elementHandle);
    return el?.isVisible ?? false;
  }

  async isEnabled(elementHandle: string): Promise<boolean> {
    const el = this.elementHandleToEl.get(elementHandle);
    return el?.isEnabled ?? false;
  }

  async isFocused(elementHandle: string): Promise<boolean> {
    const el = this.elementHandleToEl.get(elementHandle);
    return el?.isFocused ?? false;
  }

  async focusElement(elementHandle: string): Promise<void> {
    this.setFocused(elementHandle);
  }

  // --- window operations (with state tracking) ---

  async getWindowBounds(windowHandle: string): Promise<WindowBounds> {
    const win = this.assertWindow(windowHandle);
    return { ...win.bounds };
  }

  async setWindowBounds(
    windowHandle: string,
    left: number,
    top: number,
    width: number,
    height: number,
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
    return [0x42, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // miniature BMP header
  }

  async captureScreenshotToFile(elementHandle: string, _path: string): Promise<void> {
    this.assertElement(elementHandle);
  }

  // --- image finding ---

  async findImage(_windowHandle: string, _template: number[]): Promise<ImageMatch | null> {
    return { x: 100, y: 100, width: 32, height: 32, confidence: 0.95 };
  }

  async clickAt(x: number, y: number): Promise<void> {
    await delay();
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
      throw new AutomationError(`Button "${buttonText}" not found in dialog ${windowHandle}`);
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
      case "name":
        return el.selector.name ?? "";
      case "automationid":
        return el.selector.automationId ?? "";
      case "role":
      case "ariarole":
        return el.selector.role ?? "";
      case "isenabled":
        return String(el.isEnabled);
      case "isoffscreen":
        return String(!el.isVisible);
      case "haskeyboardfocus":
        return String(el.isFocused);
      case "ispassword":
        return "false";
      case "iscontrolelement":
      case "iscontentelement":
        return "true";
      case "value":
      case "text":
        return el.text;
      default:
        return "";
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

  inspectHwndTree(windowHandle: string, _maxDepth?: number): HwndNode[] {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return [];
    return win.elements.map((el) => {
      const handle = this.ensureElementHandle(el);
      return {
        handle,
        class_name: el.selector.className ?? "",
        title: el.selector.name ?? "",
        visible: el.isVisible,
        children: [],
      };
    });
  }

  inspectWindowTree(windowHandle: string, _maxDepth?: number): ElementNode[] {
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win) return [];

    // Find top-level elements (those whose parent is the window itself)
    const topLevel = win.elements.filter(
      (el) => el.parentHandle === null || el.parentHandle === windowHandle,
    );

    return topLevel.map((el) => this.elementToNode(el, _maxDepth ?? 5));
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

  async highlightElement(
    _elementHandle: string,
    _color?: string | null,
    _durationMs?: number | null,
  ): Promise<void> {
    await delay();
  }

  buildElementPath(elementHandle: string): ElementPathStep[] {
    const el = this.elementHandleToEl.get(elementHandle);
    if (!el) return [];
    // Walk up the parent chain (element parent -> window -> ...)
    const steps: ElementPathStep[] = [];
    let currentHandle: string | null = elementHandle;
    while (currentHandle) {
      const currentEl = this.elementHandleToEl.get(currentHandle);
      if (currentEl) {
        steps.push({
          role: currentEl.selector.role ?? "",
          name: currentEl.selector.name ?? "",
          automationId: currentEl.selector.automationId ?? "",
          className: currentEl.selector.className ?? "",
          siblingIndex: 0,
        });
        currentHandle = currentEl.parentHandle;
      } else {
        break;
      }
    }
    steps.reverse();
    return steps;
  }

  async resolveElementPath(windowHandle: string, path: ElementPathStep[]): Promise<string | null> {
    // Find all elements in the window that match the first path step
    const win = this.windowHandleToWin.get(windowHandle);
    if (!win || path.length === 0) return null;

    let candidates = win.elements.filter((el) => {
      for (const step of path) {
        if (step.role && el.selector.role !== step.role) return false;
        if (step.name && el.selector.name !== step.name) return false;
        if (step.automationId && el.selector.automationId !== step.automationId) return false;
        if (step.className && el.selector.className !== step.className) return false;
      }
      return true;
    });

    if (candidates.length === 0) return null;

    // For the last step, check sibling index
    const lastStep = path[path.length - 1];
    if (lastStep.siblingIndex >= 0 && lastStep.siblingIndex < candidates.length) {
      return this.ensureElementHandle(candidates[lastStep.siblingIndex]);
    }

    return this.ensureElementHandle(candidates[0]);
  }

  debugDiscovery(processId: number): WindowDebugInfo[] {
    const app = this.pidToApp.get(processId);
    if (!app) return [];
    return app.windows.map((win) => ({
      hwnd: [...this.windowHandleToWin.entries()].find(([, w]) => w.id === win.id)?.[0] ?? "0x0",
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

  async waitForUiChange(_timeoutMs: number): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, _timeoutMs));
    return false;
  }

  startWinEventWatcher(_callback: (event: WinEventInfo) => void): void {
    // no-op in mock
  }

  stopWinEventWatcher(): void {
    // no-op in mock
  }
}
