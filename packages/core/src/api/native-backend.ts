import type { Backend } from "./backend";
import type { NativeBindings } from "./types";
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

  async launch(executablePath: string | null): Promise<number> {
    return this.native.launch(executablePath);
  }

  async enumerateWindows(processId: number): Promise<string[]> {
    return this.native.enumerateWindows(processId);
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
  ): Promise<string | null> {
    return this.native.findElement(
      windowHandle,
      classNames ?? null,
      automationId ?? null,
      name ?? null,
      role ?? null,
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
  ): Promise<string[]> {
    return this.native.findAll(
      windowHandle,
      classNames ?? null,
      automationId ?? null,
      name ?? null,
      role ?? null,
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

  async getWindowBounds(windowHandle: string): Promise<{ left: number; top: number; width: number; height: number }> {
    return this.native.getWindowBounds(windowHandle);
  }

  async setWindowBounds(windowHandle: string, left: number, top: number, width: number, height: number): Promise<void> {
    return this.native.setWindowBounds(windowHandle, left, top, width, height);
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

  debugDiscovery(processId: number) {
    if (!this.native.debugDiscovery) {
      throw new Error("debugDiscovery is not available in the loaded native module.");
    }
    return this.native.debugDiscovery(processId);
  }
}
