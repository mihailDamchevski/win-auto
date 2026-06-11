import type { Backend, WinEventInfo } from "./backend";
import type {
  DialogControl,
  DialogInfo,
  ElementNode,
  ElementPathStep,
  HwndNode,
  ImageMatch,
  NativeBindings,
  ProcessEntry,
} from "./types";
import { loadNativeBindings } from "../native/loadNative";
import { BackendError, UIPI_HELP_MESSAGE } from "./errors";

export class NativeBackend implements Backend {
  private native: NativeBindings;

  constructor() {
    this.native = loadNativeBindings();
  }

  private wrapError(err: unknown): never {
    if (err instanceof BackendError) throw err;
    if (err instanceof Error) {
      const msg = err.message;
      const isUipi = /elevat|uip|permission denied|access denied/i.test(msg);
      throw new BackendError(
        isUipi ? `${msg}\n\n${UIPI_HELP_MESSAGE}` : msg,
        "native",
        err,
      );
    }
    throw new BackendError(String(err), "native", err);
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.wrapError(err);
    }
  }

  private callSync<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      this.wrapError(err);
    }
  }

  ping(): string {
    return this.native.ping();
  }

  setAppConfig(executable: string, classNames: string[]): void {
    if (this.native.setAppConfig) {
      this.native.setAppConfig(executable, classNames);
    }
  }

  async launch(executablePath: string | null, classNames?: string[] | null): Promise<number> {
    return this.native.launch(executablePath, classNames ?? null);
  }

  async launchProcess(
    executablePath: string,
    options?: { args?: string[]; cwd?: string; env?: string[]; runAs?: string },
  ): Promise<number> {
    return this.call(() => this.native.launchProcess(executablePath, options ?? undefined));
  }

  async enumerateWindows(processId: number, executable?: string | null): Promise<string[]> {
    return this.native.enumerateWindows(processId, executable ?? null);
  }

  async closeApp(processId: number): Promise<void> {
    return this.native.closeApp(processId);
  }

  async closeWindow(windowHandle: string): Promise<void> {
    return this.native.closeWindow(windowHandle);
  }

  isProcessRunning(processId: number): boolean {
    return this.native.isProcessRunning(processId);
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
    return this.native.findElement(
      windowHandle,
      classNames ?? null,
      automationId ?? null,
      name ?? null,
      role ?? null,
      className ?? null,
      text ?? null,
      matchMode ?? null,
    );
  }

  async findElementName(windowHandle: string, name: string): Promise<string | null> {
    return this.native.findElementName(windowHandle, name);
  }

  async clickElement(elementHandle: string): Promise<void> {
    return this.native.clickElement(elementHandle);
  }

  async clickElementByName(windowHandle: string, name: string): Promise<void> {
    return this.native.clickElementByName(windowHandle, name);
  }

  async clickSequence(windowHandle: string, names: string[]): Promise<void> {
    return this.native.clickSequence(windowHandle, names);
  }

  async typeText(elementHandle: string, text: string): Promise<void> {
    return this.native.typeText(elementHandle, text);
  }

  async sendKeys(elementHandle: string, text: string): Promise<void> {
    return this.native.sendKeys(elementHandle, text);
  }

  async getText(elementHandle: string): Promise<string> {
    return this.native.getText(elementHandle);
  }

  async pressKeyCodes(windowHandle: string, keyCodes: number[]): Promise<void> {
    return this.native.pressKeyCodes(windowHandle, keyCodes);
  }

  async getValue(elementHandle: string): Promise<string> {
    return this.native.getValue(elementHandle);
  }

  async setValue(elementHandle: string, value: string): Promise<void> {
    return this.native.setValue(elementHandle, value);
  }

  async selectElement(elementHandle: string): Promise<void> {
    return this.native.selectElement(elementHandle);
  }

  async toggleElement(elementHandle: string): Promise<void> {
    return this.native.toggleElement(elementHandle);
  }

  async getToggleState(elementHandle: string): Promise<string> {
    return this.native.getToggleState(elementHandle);
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
    return this.native.findAll(
      windowHandle,
      classNames ?? null,
      automationId ?? null,
      name ?? null,
      role ?? null,
      className ?? null,
      text ?? null,
      matchMode ?? null,
    );
  }

  async getParent(elementHandle: string): Promise<string | null> {
    return this.native.getParent(elementHandle);
  }

  async getChildren(elementHandle: string): Promise<string[]> {
    return this.native.getChildren(elementHandle);
  }

  async getSiblings(elementHandle: string): Promise<string[]> {
    return this.native.getSiblings(elementHandle);
  }

  async isVisible(elementHandle: string): Promise<boolean> {
    return this.native.isVisible(elementHandle);
  }

  async isEnabled(elementHandle: string): Promise<boolean> {
    return this.native.isEnabled(elementHandle);
  }

  async isFocused(elementHandle: string): Promise<boolean> {
    return this.native.isFocused(elementHandle);
  }

  async focusElement(elementHandle: string): Promise<void> {
    return this.native.focusElement(elementHandle);
  }

  async getWindowBounds(
    windowHandle: string,
  ): Promise<{ left: number; top: number; width: number; height: number }> {
    return this.native.getWindowBounds(windowHandle);
  }

  async setWindowBounds(
    windowHandle: string,
    left: number,
    top: number,
    width: number,
    height: number,
  ): Promise<void> {
    return this.native.setWindowBounds(windowHandle, left, top, width, height);
  }

  async focusWindow(windowHandle: string): Promise<void> {
    return this.native.focusWindow(windowHandle);
  }

  async maximizeWindow(windowHandle: string): Promise<void> {
    return this.native.maximizeWindow(windowHandle);
  }

  async minimizeWindow(windowHandle: string): Promise<void> {
    return this.native.minimizeWindow(windowHandle);
  }

  async restoreWindow(windowHandle: string): Promise<void> {
    return this.native.restoreWindow(windowHandle);
  }

  async pressKey(windowHandle: string, keyCombination: string): Promise<void> {
    return this.native.pressKey(windowHandle, keyCombination);
  }

  async rightClickElement(elementHandle: string): Promise<void> {
    return this.native.rightClickElement(elementHandle);
  }

  async doubleClickElement(elementHandle: string): Promise<void> {
    return this.native.doubleClickElement(elementHandle);
  }

  async hoverElement(elementHandle: string): Promise<void> {
    return this.native.hoverElement(elementHandle);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    return this.native.mouseMove(x, y);
  }

  async scrollElement(elementHandle: string, direction: string, amount: number): Promise<void> {
    return this.native.scrollElement(elementHandle, direction, amount);
  }

  async dragDrop(fromElementHandle: string, toElementHandle: string): Promise<void> {
    return this.native.dragDrop(fromElementHandle, toElementHandle);
  }

  async captureScreenshot(elementHandle: string): Promise<number[]> {
    return this.native.captureScreenshot(elementHandle);
  }

  async captureScreenshotToFile(elementHandle: string, path: string): Promise<void> {
    return this.native.captureScreenshotToFile(elementHandle, path);
  }

  async findImage(windowHandle: string, template: number[]): Promise<ImageMatch | null> {
    if (!this.native.findImage) {
      throw new BackendError("findImage is not available in the loaded native module.", "native");
    }
    return this.native.findImage(windowHandle, template);
  }

  async clickAt(x: number, y: number): Promise<void> {
    if (!this.native.clickAt) {
      throw new BackendError("clickAt is not available in the loaded native module.", "native");
    }
    return this.native.clickAt(x, y);
  }

  findDialogs(processId: number): DialogInfo[] {
    return this.native.findDialogs(processId);
  }

  getDialogControls(windowHandle: string): DialogControl[] {
    return this.native.getDialogControls(windowHandle);
  }

  async clickDialogButton(windowHandle: string, buttonText: string): Promise<void> {
    return this.native.clickDialogButton(windowHandle, buttonText);
  }

  async setDialogFilePath(windowHandle: string, path: string): Promise<void> {
    return this.native.setDialogFilePath(windowHandle, path);
  }

  findProcessesByName(imageName: string): ProcessEntry[] {
    return this.native.findProcessesByName(imageName);
  }

  async waitForProcessExit(processId: number, timeoutMs: number): Promise<boolean> {
    return this.native.waitForProcessExit(processId, timeoutMs);
  }

  getProcessImageName(processId: number): string {
    return this.native.getProcessImageName(processId);
  }

  async killProcess(processId: number): Promise<void> {
    return this.native.killProcess(processId);
  }

  isProcessElevated(processId: number): boolean {
    return this.callSync(() => this.native.isProcessElevated(processId));
  }

  async runElevated(
    executablePath: string,
    args?: string[] | null,
    cwd?: string | null,
  ): Promise<number> {
    return this.call(() => this.native.runElevated(executablePath, args ?? null, cwd ?? null));
  }

  async getElementAttribute(elementHandle: string, attributeName: string): Promise<string> {
    return this.native.getElementAttribute(elementHandle, attributeName);
  }

  async keyDown(windowHandle: string, key: string): Promise<void> {
    return this.native.keyDown(windowHandle, key);
  }

  async keyUp(windowHandle: string, key: string): Promise<void> {
    return this.native.keyUp(windowHandle, key);
  }

  async selectText(elementHandle: string): Promise<void> {
    return this.native.selectText(elementHandle);
  }

  async getSelection(elementHandle: string): Promise<string> {
    return this.native.getSelection(elementHandle);
  }

  async replaceSelectedText(elementHandle: string, text: string): Promise<void> {
    return this.native.replaceSelectedText(elementHandle, text);
  }

  inspectWindowTree(windowHandle: string, maxDepth?: number): ElementNode[] {
    return this.native.inspectWindowTree(windowHandle, maxDepth ?? null);
  }

  inspectHwndTree(windowHandle: string, maxDepth?: number): HwndNode[] {
    if (!this.native.inspectHwndTree) {
      throw new BackendError(
        "inspectHwndTree is not available in the loaded native module.",
        "native",
      );
    }
    return this.native.inspectHwndTree(windowHandle, maxDepth ?? null);
  }

  debugDiscovery(processId: number) {
    if (!this.native.debugDiscovery) {
      throw new BackendError(
        "debugDiscovery is not available in the loaded native module.",
        "native",
      );
    }
    return this.native.debugDiscovery(processId);
  }

  async highlightElement(
    elementHandle: string,
    color?: string | null,
    durationMs?: number | null,
  ): Promise<void> {
    if (!this.native.highlightElement) {
      throw new BackendError(
        "highlightElement is not available in the loaded native module.",
        "native",
      );
    }
    return this.native.highlightElement(elementHandle, color ?? null, durationMs ?? null);
  }

  buildElementPath(elementHandle: string): ElementPathStep[] {
    if (!this.native.buildElementPath) {
      throw new BackendError(
        "buildElementPath is not available in the loaded native module.",
        "native",
      );
    }
    return this.native.buildElementPath(elementHandle);
  }

  async resolveElementPath(windowHandle: string, path: ElementPathStep[]): Promise<string | null> {
    if (!this.native.resolveElementPath) {
      throw new BackendError(
        "resolveElementPath is not available in the loaded native module.",
        "native",
      );
    }
    return this.native.resolveElementPath(windowHandle, path);
  }

  async waitForUiChange(timeoutMs: number): Promise<boolean> {
    return this.native.waitForUiChange(timeoutMs);
  }

  startWinEventWatcher(callback: (event: WinEventInfo) => void): void {
    if (!this.native.startWinEventWatcher) {
      throw new BackendError(
        "startWinEventWatcher is not available in the loaded native module.",
        "native",
      );
    }
    this.native.startWinEventWatcher(callback);
  }

  stopWinEventWatcher(): void {
    if (!this.native.stopWinEventWatcher) {
      throw new BackendError(
        "stopWinEventWatcher is not available in the loaded native module.",
        "native",
      );
    }
    this.native.stopWinEventWatcher();
  }

  // ── UIA Patterns ──────────────────────────────────────────────────────

  expandCollapseExpand(elementHandle: string): void {
    return this.callSync(() => this.native.expandCollapseExpand(elementHandle));
  }

  expandCollapseCollapse(elementHandle: string): void {
    return this.callSync(() => this.native.expandCollapseCollapse(elementHandle));
  }

  scrollPatternScroll(elementHandle: string, horizontalAmount: number, verticalAmount: number): void {
    return this.callSync(() => this.native.scrollPatternScroll(elementHandle, horizontalAmount, verticalAmount));
  }

  scrollPatternSetScrollPercent(elementHandle: string, horizontalPercent: number, verticalPercent: number): void {
    return this.callSync(() => this.native.scrollPatternSetScrollPercent(elementHandle, horizontalPercent, verticalPercent));
  }

  async rangeValueGetValue(elementHandle: string): Promise<number> {
    return this.call(() => this.native.rangeValueGetValue(elementHandle));
  }

  async rangeValueSetValue(elementHandle: string, value: number): Promise<void> {
    return this.call(() => this.native.rangeValueSetValue(elementHandle, value));
  }

  windowPatternSetVisualState(elementHandle: string, state: number): void {
    return this.callSync(() => this.native.windowPatternSetVisualState(elementHandle, state));
  }

  windowPatternWaitForInputIdle(elementHandle: string, timeoutMs: number): boolean {
    return this.callSync(() => this.native.windowPatternWaitForInputIdle(elementHandle, timeoutMs));
  }

  selectionGetSelection(elementHandle: string): string[] {
    return this.callSync(() => this.native.selectionGetSelection(elementHandle));
  }

  gridGetRowCount(elementHandle: string): number {
    return this.callSync(() => this.native.gridGetRowCount(elementHandle));
  }

  gridGetColumnCount(elementHandle: string): number {
    return this.callSync(() => this.native.gridGetColumnCount(elementHandle));
  }

  gridGetItem(elementHandle: string, row: number, column: number): string {
    return this.callSync(() => this.native.gridGetItem(elementHandle, row, column));
  }

  tableGetRowHeaders(elementHandle: string): string[] {
    return this.callSync(() => this.native.tableGetRowHeaders(elementHandle));
  }

  tableGetColumnHeaders(elementHandle: string): string[] {
    return this.callSync(() => this.native.tableGetColumnHeaders(elementHandle));
  }

  selectionItemSelect(elementHandle: string): void {
    return this.callSync(() => this.native.selectionItemSelect(elementHandle));
  }

  selectionItemAddToSelection(elementHandle: string): void {
    return this.callSync(() => this.native.selectionItemAddToSelection(elementHandle));
  }

  selectionItemRemoveFromSelection(elementHandle: string): void {
    return this.callSync(() => this.native.selectionItemRemoveFromSelection(elementHandle));
  }

  selectionItemIsSelected(elementHandle: string): boolean {
    return this.callSync(() => this.native.selectionItemIsSelected(elementHandle));
  }
}
