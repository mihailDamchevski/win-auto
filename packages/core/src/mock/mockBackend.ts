import type { Backend, WinEventInfo } from "../api/backend";
import type {
  MockAppRecord,
  MockWindowRecord,
  MockElementRecord,
  MockTreeElement,
  ScheduledEvent,
} from "./mockRuntime";
import { createDefaultElement, createDefaultWindow, createDefaultApp } from "./mockRuntime";
import type {
  DialogControl,
  DialogInfo,
  ElementNode,
  ElementPathStep,
  FindImageOptions,
  FindTextOptions,
  HwndNode,
  ImageMatch,
  InputMode,
  MatchMode,
  OcrResult,
  ProcessEntry,
  WindowBounds,
  WindowDebugInfo,
  WindowInfo,
} from "../api/types";
import { AutomationError } from "../api/errors";

const MOCK_DELAY_MS = 5;

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
}

// ─── Event tracker for mock assertions ─────────────────────────────────

export type MockEventName =
  | "app:launched"
  | "app:closed"
  | "window:found"
  | "window:closed"
  | "element:clicked"
  | "element:rightClicked"
  | "element:doubleClicked"
  | "element:hovered"
  | "element:typed"
  | "element:selected"
  | "element:toggled"
  | "element:focused"
  | "element:valueChanged"
  | "mouse:moved"
  | "dialog:found"
  | "dialog:buttonClicked"
  | "dialog:fileSelected"
  | "process:connected"
  | "process:killed"
  | "process:exited";

class MockEventTracker {
  private counts = new Map<string, number>();
  private history: Array<{ event: string; data?: unknown }> = [];

  emit(event: string, data?: unknown): void {
    this.counts.set(event, (this.counts.get(event) ?? 0) + 1);
    this.history.push({ event, data });
  }

  /** Return how many times `event` was emitted. */
  emitted(event: string): number {
    return this.counts.get(event) ?? 0;
  }

  /** Full emission history (for detailed assertion). */
  all(): Array<{ event: string; data?: unknown }> {
    return [...this.history];
  }

  clear(): void {
    this.counts.clear();
    this.history = [];
  }
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
  text?: string | null,
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
  if (text != null && text !== "" && !matchesValue(recordSelector.text, text, null))
    return false;
  return true;
}

/** Walk the element tree depth-first, yielding elements that match the filter. */
function* traverseTree(
  elementHandleToEl: Map<string, MockElementRecord>,
  rootHandles: string[],
  filter: (el: MockElementRecord) => boolean,
): Generator<string> {
  const visited = new Set<string>();
  const stack = [...rootHandles];
  while (stack.length > 0) {
    const handle = stack.shift()!;
    if (visited.has(handle)) continue;
    visited.add(handle);
    const el = elementHandleToEl.get(handle);
    if (!el) continue;
    if (filter(el)) yield handle;
    // Push children to the front for depth-first order
    stack.unshift(...el.childHandles.filter((h) => !visited.has(h)));
  }
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

  /** Event tracker for test assertions. */
  readonly events = new MockEventTracker();

  private dirty = false;
  private scheduledEvents: ScheduledEvent[] = [];

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

    buildTree(tree, winHandle);
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

  /** Mark the UI state as having changed (for waitForUiChange). */
  private markDirty(): void {
    this.dirty = true;
  }

  /** Schedule a callback to run after `delayMs` milliseconds. Returns a handle for cancellation. */
  public scheduleEvent(callback: () => void, delayMs: number): string {
    const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      callback();
      this.markDirty();
      this.scheduledEvents = this.scheduledEvents.filter((s) => s.id !== id);
    }, delayMs);
    this.scheduledEvents.push({ id, callback, delayMs, timer });
    return id;
  }

  /** Cancel a specific scheduled event by its handle. */
  public cancelScheduledEvent(id: string): void {
    const idx = this.scheduledEvents.findIndex((s) => s.id === id);
    if (idx >= 0) {
      clearTimeout(this.scheduledEvents[idx].timer);
      this.scheduledEvents.splice(idx, 1);
    }
  }

  /** Cancel all pending scheduled events. */
  public cancelScheduledEvents(): void {
    for (const s of this.scheduledEvents) {
      clearTimeout(s.timer);
    }
    this.scheduledEvents = [];
  }

  /** Whether any scheduled events are pending (for waitForUiChange). */
  private hasPendingScheduledEvents(): boolean {
    return this.scheduledEvents.length > 0;
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

    this.markDirty();
    this.events.emit("app:launched", { pid, executablePath });
    return pid;
  }

  async launchProcess(
    executablePath: string,
    _options?: { args?: string[]; cwd?: string; env?: string[]; runAs?: string; job?: boolean; createNoWindow?: boolean; aumid?: string },
  ): Promise<number> {
    const pid = await this.launch(executablePath);
    this.events.emit("process:connected", { pid, executablePath });
    return pid;
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
    this.markDirty();
    this.events.emit("app:closed", { pid: processId });
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
    this.markDirty();
    this.events.emit("window:closed", { windowHandle });
    await delay();
  }

  isProcessRunning(processId: number): boolean {
    return this.pidToApp.has(processId);
  }

  // --- element finding ---

  /** Get the root element handles for a window (elements whose parent is the window itself). */
  private getTreeRoots(windowHandle: string): string[] {
    const roots: string[] = [];
    for (const [handle, el] of this.elementHandleToEl) {
      if (el.parentHandle === windowHandle) {
        roots.push(handle);
      }
    }
    return roots;
  }

  /** Traverse the element tree depth-first and collect matching handles. */
  private findInTree(
    windowHandle: string,
    filter: (el: MockElementRecord) => boolean,
  ): string[] {
    const roots = this.getTreeRoots(windowHandle);
    const results: string[] = [];
    for (const handle of traverseTree(this.elementHandleToEl, roots, filter)) {
      results.push(handle);
    }
    return results;
  }

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
    const matches = this.findInTree(windowHandle, (el) => {
      if (!classNamesMatch(el.selector.className, classNames)) return false;
      return selectorMatches(el.selector, automationId, name, role, className, text, matchMode);
    });
    if (matches.length === 0) return null;
    return matches[0];
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
    return this.findInTree(windowHandle, (el) => {
      if (!classNamesMatch(el.selector.className, classNames)) return false;
      return selectorMatches(el.selector, automationId, name, role, className, text, matchMode);
    });
  }

  // --- interactions (with state tracking) ---

  async clickElement(elementHandle: string, _mode?: InputMode): Promise<void> {
    this.assertElement(elementHandle);
    this.setFocused(elementHandle);
    this.events.emit("element:clicked", { elementHandle });
    await delay();
  }

  async rightClickElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    this.setFocused(elementHandle);
    this.events.emit("element:rightClicked", { elementHandle });
    await delay();
  }

  async doubleClickElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    this.setFocused(elementHandle);
    this.events.emit("element:doubleClicked", { elementHandle });
    await delay();
  }

  async hoverElement(elementHandle: string): Promise<void> {
    this.assertElement(elementHandle);
    this.events.emit("element:hovered", { elementHandle });
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

  async typeText(elementHandle: string, text: string, _mode?: InputMode): Promise<void> {
    const el = this.assertElement(elementHandle);
    el.text = text;
    this.setFocused(elementHandle);
    this.markDirty();
    this.events.emit("element:typed", { elementHandle, text });
    await delay();
  }

  async sendKeys(windowHandle: string, text: string, _mode?: InputMode): Promise<void> {
    const win = this.assertWindow(windowHandle);
    const textbox = win.elements.find((e) => e.selector.role === "textbox");
    if (textbox) {
      textbox.text = text;
    }
    this.markDirty();
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
    this.markDirty();
    this.events.emit("element:valueChanged", { elementHandle, value });
    await delay();
  }

  async selectElement(elementHandle: string): Promise<void> {
    const el = this.assertElement(elementHandle);
    el.isSelected = true;
    this.setFocused(elementHandle);
    this.events.emit("element:selected", { elementHandle });
    await delay();
  }

  async toggleElement(elementHandle: string): Promise<void> {
    const el = this.assertElement(elementHandle);
    el.isToggled = !el.isToggled;
    el.toggleState = el.isToggled ? "On" : "Off";
    el.isSelected = true;
    this.events.emit("element:toggled", { elementHandle, state: el.toggleState });
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
    this.events.emit("element:focused", { elementHandle });
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

  async mouseMove(x: number, y: number): Promise<void> {
    this.events.emit("mouse:moved", { x, y });
    await delay();
  }

  async scrollElement(elementHandle: string, direction: string, amount: number): Promise<void> {
    this.assertElement(elementHandle);
    this.events.emit("element:valueChanged", { elementHandle, direction, amount });
    await delay();
  }

  async dragDrop(fromElementHandle: string, toElementHandle: string): Promise<void> {
    this.assertElement(fromElementHandle);
    this.assertElement(toElementHandle);
    this.markDirty();
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

  async findImage(_windowHandle: string, _template: number[], _options?: FindImageOptions): Promise<ImageMatch | null> {
    return { x: 100, y: 100, width: 32, height: 32, confidence: 0.95, scale: 1.0 };
  }

  async findText(_windowHandle: string, _options?: FindTextOptions): Promise<OcrResult | null> {
    await delay();
    return null;
  }

  async clickAt(_x: number, _y: number): Promise<void> {
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
        dialog_type: "standard" as const,
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
    this.events.emit("process:killed", { pid: processId });
    await this.closeApp(processId);
    this.events.emit("process:exited", { pid: processId });
  }

  isProcessElevated(_processId: number): boolean {
    return false; // Mock — never elevated
  }

  async runElevated(
    executablePath: string,
    _args?: string[] | null,
    _cwd?: string | null,
  ): Promise<number> {
    // Mock — just run normally
    return this.launch(executablePath);
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

    const candidates = win.elements.filter((el) => {
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

  async waitForUiChange(timeoutMs: number): Promise<boolean> {
    // If the UI is already dirty or has pending scheduled events, return immediately
    if (this.dirty || this.hasPendingScheduledEvents()) {
      // Consume the dirty flag (snapshot state)
      await delay();
      const changed = this.dirty || this.hasPendingScheduledEvents();
      this.dirty = false;
      return changed;
    }
    // Otherwise wait for the full timeout (simulating a real wait) and return false
    await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, MOCK_DELAY_MS)));
    this.dirty = false;
    return false;
  }

  startWinEventWatcher(_callback: (event: WinEventInfo) => void): void {
    // no-op in mock
  }

  stopWinEventWatcher(): void {
    // no-op in mock
  }

  // ── UIA Patterns (mock) ───────────────────────────────────────────────

  invokePattern(_elementHandle: string): void {
    // no-op in mock
  }

  expandCollapseExpand(_elementHandle: string): void {
    // no-op in mock
  }

  expandCollapseCollapse(_elementHandle: string): void {
    // no-op in mock
  }

  scrollPatternScroll(_elementHandle: string, _horizontalAmount: number, _verticalAmount: number): void {
    // no-op in mock
  }

  scrollPatternSetScrollPercent(_elementHandle: string, _horizontalPercent: number, _verticalPercent: number): void {
    // no-op in mock
  }

  async rangeValueGetValue(_elementHandle: string): Promise<number> {
    return 0;
  }

  async rangeValueSetValue(_elementHandle: string, _value: number): Promise<void> {
    // no-op in mock
  }

  windowPatternSetVisualState(_elementHandle: string, _state: number): void {
    // no-op in mock
  }

  windowPatternWaitForInputIdle(_elementHandle: string, _timeoutMs: number): boolean {
    return true;
  }

  selectionGetSelection(_elementHandle: string): string[] {
    return [];
  }

  gridGetRowCount(_elementHandle: string): number {
    return 0;
  }

  gridGetColumnCount(_elementHandle: string): number {
    return 0;
  }

  gridGetItem(_elementHandle: string, _row: number, _column: number): string {
    return "";
  }

  tableGetRowHeaders(_elementHandle: string): string[] {
    return [];
  }

  tableGetColumnHeaders(_elementHandle: string): string[] {
    return [];
  }

  selectionItemSelect(_elementHandle: string): void {
    // no-op in mock
  }

  selectionItemAddToSelection(_elementHandle: string): void {
    // no-op in mock
  }

  selectionItemRemoveFromSelection(_elementHandle: string): void {
    // no-op in mock
  }

  selectionItemIsSelected(_elementHandle: string): boolean {
    return false;
  }

  // ---- P6: Legacy App Toolkit (mock stubs) ----
  getWindowInfo(_windowHandle: string): WindowInfo {
    return {
      class_name: "MockClass",
      text: "",
      style: 0,
      ex_style: 0,
      pid: 0,
      thread_id: 0,
      is_unicode: true,
      parent_hwnd: "0",
      owner_hwnd: "0",
      dpi: 96,
    };
  }

  sendWmCommand(_windowHandle: string, _controlId: number, _commandId: number): void {
    // no-op in mock
  }

  sendWmSetText(_controlHandle: string, _text: string): void {
    // no-op in mock
  }

  sendWmNotify(_windowHandle: string, _controlId: number, _notificationCode: number): void {
    // no-op in mock
  }

  detectDialogType(_windowHandle: string): string {
    return "standard";
  }

  async launchByAumid(_aumid: string): Promise<number> {
    return 0;
  }
}
