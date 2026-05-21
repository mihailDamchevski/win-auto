import type { WindowBounds, WindowDebugInfo } from "./types";

export interface Backend {
  ping(): string;
  setAppConfig(executable: string, classNames: string[]): void;
  launch(executablePath: string | null): Promise<number>;
  enumerateWindows(processId: number): Promise<string[]>;
  closeApp(processId: number): Promise<void>;
  closeWindow(windowHandle: string): Promise<void>;
  isProcessRunning(processId: number): boolean;
  findElement(
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
  ): Promise<string | null>;
  findElementName(windowHandle: string, name: string): Promise<string | null>;
  clickElement(elementHandle: string): Promise<void>;
  clickElementByName(windowHandle: string, name: string): Promise<void>;
  clickSequence(windowHandle: string, names: string[]): Promise<void>;
  typeText(elementHandle: string, text: string): Promise<void>;
  sendKeys(elementHandle: string, text: string): Promise<void>;
  getText(elementHandle: string): Promise<string>;
  pressKeyCodes(windowHandle: string, keyCodes: number[]): Promise<void>;
  getValue(elementHandle: string): Promise<string>;
  setValue(elementHandle: string, value: string): Promise<void>;
  selectElement(elementHandle: string): Promise<void>;
  toggleElement(elementHandle: string): Promise<void>;
  getToggleState(elementHandle: string): Promise<string>;
  findAll(
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
  ): Promise<string[]>;
  getParent(elementHandle: string): Promise<string | null>;
  getChildren(elementHandle: string): Promise<string[]>;
  getSiblings(elementHandle: string): Promise<string[]>;
  isVisible(elementHandle: string): Promise<boolean>;
  isEnabled(elementHandle: string): Promise<boolean>;
  isFocused(elementHandle: string): Promise<boolean>;
  getWindowBounds(windowHandle: string): Promise<WindowBounds>;
  setWindowBounds(windowHandle: string, left: number, top: number, width: number, height: number): Promise<void>;
  maximizeWindow(windowHandle: string): Promise<void>;
  minimizeWindow(windowHandle: string): Promise<void>;
  restoreWindow(windowHandle: string): Promise<void>;
  pressKey(windowHandle: string, keyCombination: string): Promise<void>;
  debugDiscovery(processId: number): WindowDebugInfo[];
}
