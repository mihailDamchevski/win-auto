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

export interface Backend {
  ping(): string;
  launch(executablePath: string | null, classNames?: string[] | null): Promise<number>;
  launchProcess(
    executablePath: string,
    options?: { args?: string[]; cwd?: string; env?: string[]; runAs?: string; job?: boolean; createNoWindow?: boolean; aumid?: string },
  ): Promise<number>;
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
  clickElement(elementHandle: string, mode?: InputMode): Promise<void>;
  clickElementByName(windowHandle: string, name: string): Promise<void>;
  clickSequence(windowHandle: string, names: string[]): Promise<void>;
  typeText(elementHandle: string, text: string, mode?: InputMode): Promise<void>;
  sendKeys(elementHandle: string, text: string, mode?: InputMode): Promise<void>;
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
  setWindowBounds(
    windowHandle: string,
    left: number,
    top: number,
    width: number,
    height: number,
  ): Promise<void>;
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
  findImage(windowHandle: string, template: number[], options?: FindImageOptions): Promise<ImageMatch | null>;
  findText(windowHandle: string, options?: FindTextOptions): Promise<OcrResult | null>;
  clickAt(x: number, y: number): Promise<void>;
  findDialogs(processId: number): DialogInfo[];
  getDialogControls(windowHandle: string): DialogControl[];
  clickDialogButton(windowHandle: string, buttonText: string): Promise<void>;
  setDialogFilePath(windowHandle: string, path: string): Promise<void>;
  findProcessesByName(imageName: string): ProcessEntry[];
  waitForProcessExit(processId: number, timeoutMs: number): Promise<boolean>;
  getProcessImageName(processId: number): string;
  killProcess(processId: number): Promise<void>;
  isProcessElevated(processId: number): boolean;
  runElevated(
    executablePath: string,
    args?: string[] | null,
    cwd?: string | null,
  ): Promise<number>;
  getElementAttribute(elementHandle: string, attributeName: string): Promise<string>;
  keyDown(windowHandle: string, key: string): Promise<void>;
  keyUp(windowHandle: string, key: string): Promise<void>;
  selectText(elementHandle: string): Promise<void>;
  getSelection(elementHandle: string): Promise<string>;
  replaceSelectedText(elementHandle: string, text: string): Promise<void>;
  inspectWindowTree(windowHandle: string, maxDepth?: number): ElementNode[];
  inspectHwndTree(windowHandle: string, maxDepth?: number): HwndNode[];
  debugDiscovery(processId: number): WindowDebugInfo[];
  highlightElement(
    elementHandle: string,
    color?: string | null,
    durationMs?: number | null,
  ): Promise<void>;
  buildElementPath(elementHandle: string): ElementPathStep[];
  resolveElementPath(windowHandle: string, path: ElementPathStep[]): Promise<string | null>;
  waitForUiChange(timeoutMs: number): Promise<boolean>;
  startWinEventWatcher(callback: (event: WinEventInfo) => void): void;
  stopWinEventWatcher(): void;
  expandCollapseExpand(elementHandle: string): void;
  expandCollapseCollapse(elementHandle: string): void;
  scrollPatternScroll(elementHandle: string, horizontalAmount: number, verticalAmount: number): void;
  scrollPatternSetScrollPercent(elementHandle: string, horizontalPercent: number, verticalPercent: number): void;
  rangeValueGetValue(elementHandle: string): Promise<number>;
  rangeValueSetValue(elementHandle: string, value: number): Promise<void>;
  windowPatternSetVisualState(elementHandle: string, state: number): void;
  windowPatternWaitForInputIdle(elementHandle: string, timeoutMs: number): boolean;
  selectionGetSelection(elementHandle: string): string[];
  gridGetRowCount(elementHandle: string): number;
  gridGetColumnCount(elementHandle: string): number;
  gridGetItem(elementHandle: string, row: number, column: number): string;
  tableGetRowHeaders(elementHandle: string): string[];
  tableGetColumnHeaders(elementHandle: string): string[];
  selectionItemSelect(elementHandle: string): void;
  selectionItemAddToSelection(elementHandle: string): void;
  selectionItemRemoveFromSelection(elementHandle: string): void;
  selectionItemIsSelected(elementHandle: string): boolean;

  invokePattern(elementHandle: string): void;

  // ---- P6: Legacy App Toolkit ----
  getWindowInfo(windowHandle: string): WindowInfo;
  sendWmCommand(windowHandle: string, controlId: number, commandId: number): void;
  sendWmSetText(controlHandle: string, text: string): void;
  sendWmNotify(windowHandle: string, controlId: number, notificationCode: number): void;
  detectDialogType(windowHandle: string): string;
  launchByAumid(aumid: string): Promise<number>;
}

export type WinEventInfo = {
  eventType: number;
  hwnd: string;
  idObject: number;
  idChild: number;
  idEventThread: number;
  timestamp: number;
};
