import type { Backend } from "./backend";
import type { DialogControl, DialogInfo, ElementNode, ElementPathStep, HwndNode, ImageMatch, NativeBindings, ProcessEntry } from "./types";
import { loadNativeBindings } from "../native/loadNative";

export class NativeBackend implements Backend {
  private native: NativeBindings;

  constructor() {
    this.native = loadNativeBindings();
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

  async getWindowBounds(windowHandle: string): Promise<{ left: number; top: number; width: number; height: number }> {
    return this.native.getWindowBounds(windowHandle);
  }

  async setWindowBounds(windowHandle: string, left: number, top: number, width: number, height: number): Promise<void> {
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
      throw new Error("findImage is not available in the loaded native module.");
    }
    return this.native.findImage(windowHandle, template);
  }

  async clickAt(x: number, y: number): Promise<void> {
    if (!this.native.clickAt) {
      throw new Error("clickAt is not available in the loaded native module.");
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
      throw new Error("inspectHwndTree is not available in the loaded native module.");
    }
    return this.native.inspectHwndTree(windowHandle, maxDepth ?? null);
  }

  debugDiscovery(processId: number) {
    if (!this.native.debugDiscovery) {
      throw new Error("debugDiscovery is not available in the loaded native module.");
    }
    return this.native.debugDiscovery(processId);
  }

  async highlightElement(elementHandle: string, color?: string | null, durationMs?: number | null): Promise<void> {
    if (!this.native.highlightElement) {
      throw new Error("highlightElement is not available in the loaded native module.");
    }
    return this.native.highlightElement(elementHandle, color ?? null, durationMs ?? null);
  }

  buildElementPath(elementHandle: string): ElementPathStep[] {
    if (!this.native.buildElementPath) {
      throw new Error("buildElementPath is not available in the loaded native module.");
    }
    return this.native.buildElementPath(elementHandle);
  }

  async resolveElementPath(windowHandle: string, path: ElementPathStep[]): Promise<string | null> {
    if (!this.native.resolveElementPath) {
      throw new Error("resolveElementPath is not available in the loaded native module.");
    }
    return this.native.resolveElementPath(windowHandle, path);
  }

  async waitForUiChange(timeoutMs: number): Promise<boolean> {
    return this.native.waitForUiChange(timeoutMs);
  }
}
