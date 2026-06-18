import type { Backend, WinEventInfo } from "./backend";
import type { PluginManager } from "./plugin";
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
  OcrResult,
  ProcessEntry,
  WindowBounds,
  WindowDebugInfo,
  WindowInfo,
} from "./types";

/**
 * Proxy that wraps a Backend and dispatches plugin hooks before/after
 * every method call. This is an opt-in wrapper — Automation installs it
 * only when plugins are registered.
 */
export class PluginBackendProxy implements Backend {
  private inner: Backend;
  private plugins: PluginManager;

  constructor(inner: Backend, plugins: PluginManager) {
    this.inner = inner;
    this.plugins = plugins;
  }

  /** Get the underlying backend (for direct access if needed). */
  getInner(): Backend {
    return this.inner;
  }

  private async wrap<A extends unknown[], R>(
    action: string,
    params: Record<string, unknown>,
    fn: (...args: A) => R | Promise<R>,
    ...args: A
  ): Promise<R> {
    const proceed = await this.plugins.dispatchBeforeAction(action, params);
    if (!proceed) throw new Error(`Action "${action}" cancelled by plugin`);
    try {
      const result = await fn(...args);
      await this.plugins.dispatchAfterAction(action, params, result);
      return result;
    } catch (err) {
      await this.plugins.dispatchOnError(action, params, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  // ─── All Backend methods ────────────────────────────────────────────

  ping(): string {
    return this.inner.ping();
  }

  async launch(executablePath: string | null, classNames?: string[] | null): Promise<number> {
    return this.wrap("backend:launch", { executablePath }, this.inner.launch.bind(this.inner), executablePath, classNames);
  }

  async launchProcess(
    executablePath: string,
    options?: { args?: string[]; cwd?: string; env?: string[]; runAs?: string; job?: boolean; createNoWindow?: boolean; aumid?: string },
  ): Promise<number> {
    return this.wrap("backend:launchProcess", { executablePath, options }, this.inner.launchProcess.bind(this.inner), executablePath, options);
  }

  async enumerateWindows(processId: number, executable?: string | null): Promise<string[]> {
    return this.inner.enumerateWindows(processId, executable);
  }

  async closeApp(processId: number): Promise<void> {
    return this.wrap("backend:closeApp", { processId }, this.inner.closeApp.bind(this.inner), processId);
  }

  async closeWindow(windowHandle: string): Promise<void> {
    return this.inner.closeWindow(windowHandle);
  }

  isProcessRunning(processId: number): boolean {
    return this.inner.isProcessRunning(processId);
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
    return this.wrap("backend:findElement", { windowHandle, automationId, name, role }, this.inner.findElement.bind(this.inner), windowHandle, classNames, automationId, name, role, className, text, matchMode);
  }

  async findElementName(windowHandle: string, name: string): Promise<string | null> {
    return this.inner.findElementName(windowHandle, name);
  }

  async clickElement(elementHandle: string, mode?: InputMode): Promise<void> {
    return this.wrap("backend:clickElement", { elementHandle, mode }, this.inner.clickElement.bind(this.inner), elementHandle, mode);
  }

  async clickElementByName(windowHandle: string, name: string): Promise<void> {
    return this.inner.clickElementByName(windowHandle, name);
  }

  async clickSequence(windowHandle: string, names: string[]): Promise<void> {
    return this.inner.clickSequence(windowHandle, names);
  }

  async typeText(elementHandle: string, text: string, mode?: InputMode): Promise<void> {
    return this.wrap("backend:typeText", { elementHandle, text, mode }, this.inner.typeText.bind(this.inner), elementHandle, text, mode);
  }

  async sendKeys(elementHandle: string, text: string, mode?: InputMode): Promise<void> {
    return this.wrap("backend:sendKeys", { elementHandle, text }, this.inner.sendKeys.bind(this.inner), elementHandle, text, mode);
  }

  async getText(elementHandle: string): Promise<string> {
    return this.inner.getText(elementHandle);
  }

  async pressKeyCodes(windowHandle: string, keyCodes: number[]): Promise<void> {
    return this.inner.pressKeyCodes(windowHandle, keyCodes);
  }

  async getValue(elementHandle: string): Promise<string> {
    return this.inner.getValue(elementHandle);
  }

  async setValue(elementHandle: string, value: string): Promise<void> {
    return this.wrap("backend:setValue", { elementHandle, value }, this.inner.setValue.bind(this.inner), elementHandle, value);
  }

  async selectElement(elementHandle: string): Promise<void> {
    return this.inner.selectElement(elementHandle);
  }

  async toggleElement(elementHandle: string): Promise<void> {
    return this.inner.toggleElement(elementHandle);
  }

  async getToggleState(elementHandle: string): Promise<string> {
    return this.inner.getToggleState(elementHandle);
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
    return this.inner.findAll(windowHandle, classNames, automationId, name, role, className, text, matchMode);
  }

  async getParent(elementHandle: string): Promise<string | null> {
    return this.inner.getParent(elementHandle);
  }

  async getChildren(elementHandle: string): Promise<string[]> {
    return this.inner.getChildren(elementHandle);
  }

  async getSiblings(elementHandle: string): Promise<string[]> {
    return this.inner.getSiblings(elementHandle);
  }

  async isVisible(elementHandle: string): Promise<boolean> {
    return this.inner.isVisible(elementHandle);
  }

  async isEnabled(elementHandle: string): Promise<boolean> {
    return this.inner.isEnabled(elementHandle);
  }

  async isFocused(elementHandle: string): Promise<boolean> {
    return this.inner.isFocused(elementHandle);
  }

  async focusElement(elementHandle: string): Promise<void> {
    return this.wrap("backend:focusElement", { elementHandle }, this.inner.focusElement.bind(this.inner), elementHandle);
  }

  async getWindowBounds(windowHandle: string): Promise<WindowBounds> {
    return this.inner.getWindowBounds(windowHandle);
  }

  async setWindowBounds(windowHandle: string, left: number, top: number, width: number, height: number): Promise<void> {
    return this.wrap("backend:setWindowBounds", { windowHandle, left, top, width, height }, this.inner.setWindowBounds.bind(this.inner), windowHandle, left, top, width, height);
  }

  async focusWindow(windowHandle: string): Promise<void> {
    return this.inner.focusWindow(windowHandle);
  }

  async maximizeWindow(windowHandle: string): Promise<void> {
    return this.inner.maximizeWindow(windowHandle);
  }

  async minimizeWindow(windowHandle: string): Promise<void> {
    return this.inner.minimizeWindow(windowHandle);
  }

  async restoreWindow(windowHandle: string): Promise<void> {
    return this.inner.restoreWindow(windowHandle);
  }

  async pressKey(windowHandle: string, keyCombination: string): Promise<void> {
    return this.wrap("backend:pressKey", { windowHandle, keyCombination }, this.inner.pressKey.bind(this.inner), windowHandle, keyCombination);
  }

  async rightClickElement(elementHandle: string): Promise<void> {
    return this.inner.rightClickElement(elementHandle);
  }

  async doubleClickElement(elementHandle: string): Promise<void> {
    return this.inner.doubleClickElement(elementHandle);
  }

  async hoverElement(elementHandle: string): Promise<void> {
    return this.inner.hoverElement(elementHandle);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    return this.inner.mouseMove(x, y);
  }

  async scrollElement(elementHandle: string, direction: string, amount: number): Promise<void> {
    return this.inner.scrollElement(elementHandle, direction, amount);
  }

  async dragDrop(fromElementHandle: string, toElementHandle: string): Promise<void> {
    return this.inner.dragDrop(fromElementHandle, toElementHandle);
  }

  async captureScreenshot(elementHandle: string): Promise<number[]> {
    return this.inner.captureScreenshot(elementHandle);
  }

  async captureScreenshotToFile(elementHandle: string, path: string): Promise<void> {
    return this.inner.captureScreenshotToFile(elementHandle, path);
  }

  async findImage(windowHandle: string, template: number[], options?: FindImageOptions): Promise<ImageMatch | null> {
    return this.inner.findImage(windowHandle, template, options);
  }

  async findText(windowHandle: string, options?: FindTextOptions): Promise<OcrResult | null> {
    return this.inner.findText(windowHandle, options);
  }

  async clickAt(x: number, y: number): Promise<void> {
    return this.inner.clickAt(x, y);
  }

  findDialogs(processId: number): DialogInfo[] {
    return this.inner.findDialogs(processId);
  }

  getDialogControls(windowHandle: string): DialogControl[] {
    return this.inner.getDialogControls(windowHandle);
  }

  async clickDialogButton(windowHandle: string, buttonText: string): Promise<void> {
    return this.wrap("backend:clickDialogButton", { windowHandle, buttonText }, this.inner.clickDialogButton.bind(this.inner), windowHandle, buttonText);
  }

  async setDialogFilePath(windowHandle: string, path: string): Promise<void> {
    return this.inner.setDialogFilePath(windowHandle, path);
  }

  findProcessesByName(imageName: string): ProcessEntry[] {
    return this.inner.findProcessesByName(imageName);
  }

  async waitForProcessExit(processId: number, timeoutMs: number): Promise<boolean> {
    return this.inner.waitForProcessExit(processId, timeoutMs);
  }

  getProcessImageName(processId: number): string {
    return this.inner.getProcessImageName(processId);
  }

  async killProcess(processId: number): Promise<void> {
    return this.wrap("backend:killProcess", { processId }, this.inner.killProcess.bind(this.inner), processId);
  }

  isProcessElevated(processId: number): boolean {
    return this.inner.isProcessElevated(processId);
  }

  async runElevated(executablePath: string, args?: string[] | null, cwd?: string | null): Promise<number> {
    return this.wrap("backend:runElevated", { executablePath }, this.inner.runElevated.bind(this.inner), executablePath, args, cwd);
  }

  async getElementAttribute(elementHandle: string, attributeName: string): Promise<string> {
    return this.inner.getElementAttribute(elementHandle, attributeName);
  }

  async keyDown(windowHandle: string, key: string): Promise<void> {
    return this.inner.keyDown(windowHandle, key);
  }

  async keyUp(windowHandle: string, key: string): Promise<void> {
    return this.inner.keyUp(windowHandle, key);
  }

  async selectText(elementHandle: string): Promise<void> {
    return this.inner.selectText(elementHandle);
  }

  async getSelection(elementHandle: string): Promise<string> {
    return this.inner.getSelection(elementHandle);
  }

  async replaceSelectedText(elementHandle: string, text: string): Promise<void> {
    return this.wrap("backend:replaceSelectedText", { elementHandle, text }, this.inner.replaceSelectedText.bind(this.inner), elementHandle, text);
  }

  inspectWindowTree(windowHandle: string, maxDepth?: number): ElementNode[] {
    return this.inner.inspectWindowTree(windowHandle, maxDepth);
  }

  inspectHwndTree(windowHandle: string, maxDepth?: number): HwndNode[] {
    return this.inner.inspectHwndTree(windowHandle, maxDepth);
  }

  debugDiscovery(processId: number): WindowDebugInfo[] {
    return this.inner.debugDiscovery(processId);
  }

  async highlightElement(elementHandle: string, color?: string | null, durationMs?: number | null): Promise<void> {
    return this.inner.highlightElement(elementHandle, color, durationMs);
  }

  buildElementPath(elementHandle: string): ElementPathStep[] {
    return this.inner.buildElementPath(elementHandle);
  }

  async resolveElementPath(windowHandle: string, path: ElementPathStep[]): Promise<string | null> {
    return this.inner.resolveElementPath(windowHandle, path);
  }

  async waitForUiChange(timeoutMs: number): Promise<boolean> {
    return this.inner.waitForUiChange(timeoutMs);
  }

  startWinEventWatcher(callback: (event: WinEventInfo) => void): void {
    this.inner.startWinEventWatcher(callback);
  }

  stopWinEventWatcher(): void {
    this.inner.stopWinEventWatcher();
  }

  expandCollapseExpand(elementHandle: string): void {
    this.inner.expandCollapseExpand(elementHandle);
  }

  expandCollapseCollapse(elementHandle: string): void {
    this.inner.expandCollapseCollapse(elementHandle);
  }

  scrollPatternScroll(elementHandle: string, horizontalAmount: number, verticalAmount: number): void {
    this.inner.scrollPatternScroll(elementHandle, horizontalAmount, verticalAmount);
  }

  scrollPatternSetScrollPercent(elementHandle: string, horizontalPercent: number, verticalPercent: number): void {
    this.inner.scrollPatternSetScrollPercent(elementHandle, horizontalPercent, verticalPercent);
  }

  async rangeValueGetValue(elementHandle: string): Promise<number> {
    return this.inner.rangeValueGetValue(elementHandle);
  }

  async rangeValueSetValue(elementHandle: string, value: number): Promise<void> {
    return this.wrap("backend:rangeValueSetValue", { elementHandle, value }, this.inner.rangeValueSetValue.bind(this.inner), elementHandle, value);
  }

  windowPatternSetVisualState(elementHandle: string, state: number): void {
    this.inner.windowPatternSetVisualState(elementHandle, state);
  }

  windowPatternWaitForInputIdle(elementHandle: string, timeoutMs: number): boolean {
    return this.inner.windowPatternWaitForInputIdle(elementHandle, timeoutMs);
  }

  selectionGetSelection(elementHandle: string): string[] {
    return this.inner.selectionGetSelection(elementHandle);
  }

  gridGetRowCount(elementHandle: string): number {
    return this.inner.gridGetRowCount(elementHandle);
  }

  gridGetColumnCount(elementHandle: string): number {
    return this.inner.gridGetColumnCount(elementHandle);
  }

  gridGetItem(elementHandle: string, row: number, column: number): string {
    return this.inner.gridGetItem(elementHandle, row, column);
  }

  tableGetRowHeaders(elementHandle: string): string[] {
    return this.inner.tableGetRowHeaders(elementHandle);
  }

  tableGetColumnHeaders(elementHandle: string): string[] {
    return this.inner.tableGetColumnHeaders(elementHandle);
  }

  selectionItemSelect(elementHandle: string): void {
    this.inner.selectionItemSelect(elementHandle);
  }

  selectionItemAddToSelection(elementHandle: string): void {
    this.inner.selectionItemAddToSelection(elementHandle);
  }

  selectionItemRemoveFromSelection(elementHandle: string): void {
    this.inner.selectionItemRemoveFromSelection(elementHandle);
  }

  selectionItemIsSelected(elementHandle: string): boolean {
    return this.inner.selectionItemIsSelected(elementHandle);
  }

  getWindowInfo(windowHandle: string): WindowInfo {
    return this.inner.getWindowInfo(windowHandle);
  }

  sendWmCommand(windowHandle: string, controlId: number, commandId: number): void {
    this.inner.sendWmCommand(windowHandle, controlId, commandId);
  }

  sendWmSetText(controlHandle: string, text: string): void {
    this.inner.sendWmSetText(controlHandle, text);
  }

  sendWmNotify(windowHandle: string, controlId: number, notificationCode: number): void {
    this.inner.sendWmNotify(windowHandle, controlId, notificationCode);
  }

  detectDialogType(windowHandle: string): string {
    return this.inner.detectDialogType(windowHandle);
  }

  async launchByAumid(aumid: string): Promise<number> {
    return this.wrap("backend:launchByAumid", { aumid }, this.inner.launchByAumid.bind(this.inner), aumid);
  }

  invokePattern(elementHandle: string): void {
    this.inner.invokePattern(elementHandle);
  }
}
