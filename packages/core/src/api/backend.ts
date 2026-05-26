import type { DialogControl, DialogInfo, ElementNode, ElementPathStep, HwndNode, ImageMatch, ProcessEntry, WindowBounds, WindowDebugInfo } from "./types";

export interface Backend {
  ping(): string;
  setAppConfig(executable: string, classNames: string[]): void;
  launch(executablePath: string | null, classNames?: string[] | null): Promise<number>;
  enumerateWindows(processId: number, executable?: string | null): Promise<string[]>;
  closeApp(processId: number): Promise<void>;
  closeWindow(windowHandle: string): Promise<void>;
  isProcessRunning(processId: number): boolean;
  findElement(
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
    className?: string | null,
    text?: string | null,
    matchMode?: string | null,
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
    className?: string | null,
    text?: string | null,
    matchMode?: string | null,
  ): Promise<string[]>;
  getParent(elementHandle: string): Promise<string | null>;
  getChildren(elementHandle: string): Promise<string[]>;
  getSiblings(elementHandle: string): Promise<string[]>;
  isVisible(elementHandle: string): Promise<boolean>;
  isEnabled(elementHandle: string): Promise<boolean>;
  isFocused(elementHandle: string): Promise<boolean>;
  focusElement(elementHandle: string): Promise<void>;
  getWindowBounds(windowHandle: string): Promise<WindowBounds>;
  setWindowBounds(windowHandle: string, left: number, top: number, width: number, height: number): Promise<void>;
  focusWindow(windowHandle: string): Promise<void>;
  maximizeWindow(windowHandle: string): Promise<void>;
  minimizeWindow(windowHandle: string): Promise<void>;
  restoreWindow(windowHandle: string): Promise<void>;
  pressKey(windowHandle: string, keyCombination: string): Promise<void>;
  rightClickElement(elementHandle: string): Promise<void>;
  doubleClickElement(elementHandle: string): Promise<void>;
  hoverElement(elementHandle: string): Promise<void>;
  mouseMove(x: number, y: number): Promise<void>;
  scrollElement(elementHandle: string, direction: string, amount: number): Promise<void>;
  dragDrop(fromElementHandle: string, toElementHandle: string): Promise<void>;
  captureScreenshot(elementHandle: string): Promise<number[]>;
  captureScreenshotToFile(elementHandle: string, path: string): Promise<void>;
  findImage(windowHandle: string, template: number[]): Promise<ImageMatch | null>;
  clickAt(x: number, y: number): Promise<void>;
  findDialogs(processId: number): DialogInfo[];
  getDialogControls(windowHandle: string): DialogControl[];
  clickDialogButton(windowHandle: string, buttonText: string): Promise<void>;
  setDialogFilePath(windowHandle: string, path: string): Promise<void>;
  findProcessesByName(imageName: string): ProcessEntry[];
  waitForProcessExit(processId: number, timeoutMs: number): Promise<boolean>;
  getProcessImageName(processId: number): string;
  killProcess(processId: number): Promise<void>;
  getElementAttribute(elementHandle: string, attributeName: string): Promise<string>;
  keyDown(windowHandle: string, key: string): Promise<void>;
  keyUp(windowHandle: string, key: string): Promise<void>;
  selectText(elementHandle: string): Promise<void>;
  getSelection(elementHandle: string): Promise<string>;
  replaceSelectedText(elementHandle: string, text: string): Promise<void>;
  inspectWindowTree(windowHandle: string, maxDepth?: number): ElementNode[];
  inspectHwndTree(windowHandle: string, maxDepth?: number): HwndNode[];
  debugDiscovery(processId: number): WindowDebugInfo[];
  highlightElement(elementHandle: string, color?: string | null, durationMs?: number | null): Promise<void>;
  buildElementPath(elementHandle: string): ElementPathStep[];
  resolveElementPath(windowHandle: string, path: ElementPathStep[]): Promise<string | null>;
  waitForUiChange(timeoutMs: number): Promise<boolean>;
}
