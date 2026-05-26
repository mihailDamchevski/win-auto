export type AppSelector = {
  executablePath?: string;
  processId?: number;
  title?: string;
};

export type LaunchOptions = {
  executablePath: string;
  args?: string[];
  title?: string;
};

export type MatchMode = "substring" | "exact" | "regex";

export type ElementSelector = {
  automationId?: string;
  name?: string;
  role?: string;
  className?: string;
  text?: string;
  matchMode?: MatchMode;
};

export type WindowBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WindowDebugInfo = {
  hwnd: string;
  pid: number;
  className: string;
  title: string;
  visible: boolean;
  ownerInvalid: boolean;
  matchesTargetPid: boolean;
  passesTopLevelVisible: boolean;
  processImage: string;
};

export type ElementAttributeName =
  | "name"
  | "automationId"
  | "role"
  | "ariaRole"
  | "helpText"
  | "className"
  | "accessKey"
  | "acceleratorKey"
  | "itemType"
  | "itemStatus"
  | "culture"
  | "isEnabled"
  | "isOffscreen"
  | "hasKeyboardFocus"
  | "isPassword"
  | "isRequiredForForm"
  | "isControlElement"
  | "isContentElement"
  | "processId"
  | "boundingRectangle"
  | "bounds"
  | "localizedControlType"
  | "value";

export type NativeBindings = {
  ping: () => string;
  setAppConfig?: (executable: string, classNames: string[]) => void;
  launch: (executablePath?: string | null, classNames?: string[] | null) => Promise<number>;
  enumerateWindows: (processId: number, executable?: string | null) => Promise<string[]>;
  debugDiscovery?: (processId: number) => WindowDebugInfo[];
  findElement: (
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
    className?: string | null,
    text?: string | null,
    matchMode?: string | null,
  ) => Promise<string | null>;
  typeText: (elementHandle: string, text: string) => Promise<void>;
  sendKeys: (elementHandle: string, text: string) => Promise<void>;
  closeApp: (processId: number) => Promise<void>;
  closeWindow: (elementHandle: string) => Promise<void>;
  isProcessRunning: (processId: number) => boolean;
  getText: (elementHandle: string) => Promise<string>;
  findElementName: (
    windowHandle: string,
    name: string,
  ) => Promise<string | null>;
  clickElement: (elementHandle: string) => Promise<void>;
  clickElementByName: (windowHandle: string, name: string) => Promise<void>;
  clickSequence: (windowHandle: string, names: string[]) => Promise<void>;
  pressKeyCodes: (windowHandle: string, keyCodes: number[]) => Promise<void>;
  getValue: (elementHandle: string) => Promise<string>;
  setValue: (elementHandle: string, value: string) => Promise<void>;
  selectElement: (elementHandle: string) => Promise<void>;
  toggleElement: (elementHandle: string) => Promise<void>;
  getToggleState: (elementHandle: string) => Promise<string>;
  findAll: (
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null,
    className?: string | null,
    text?: string | null,
    matchMode?: string | null,
  ) => Promise<string[]>;
  getParent: (elementHandle: string) => Promise<string | null>;
  getChildren: (elementHandle: string) => Promise<string[]>;
  getSiblings: (elementHandle: string) => Promise<string[]>;
  isVisible: (elementHandle: string) => Promise<boolean>;
  isEnabled: (elementHandle: string) => Promise<boolean>;
  isFocused: (elementHandle: string) => Promise<boolean>;
  getWindowBounds: (windowHandle: string) => Promise<{ left: number; top: number; width: number; height: number }>;
  setWindowBounds: (windowHandle: string, left: number, top: number, width: number, height: number) => Promise<void>;
  focusWindow: (windowHandle: string) => Promise<void>;
  maximizeWindow: (windowHandle: string) => Promise<void>;
  minimizeWindow: (windowHandle: string) => Promise<void>;
  restoreWindow: (windowHandle: string) => Promise<void>;
  pressKey: (windowHandle: string, keyCombination: string) => Promise<void>;
  rightClickElement: (elementHandle: string) => Promise<void>;
  doubleClickElement: (elementHandle: string) => Promise<void>;
  hoverElement: (elementHandle: string) => Promise<void>;
  mouseMove: (x: number, y: number) => Promise<void>;
  scrollElement: (elementHandle: string, direction: string, amount: number) => Promise<void>;
  dragDrop: (fromElementHandle: string, toElementHandle: string) => Promise<void>;
  captureScreenshot: (elementHandle: string) => Promise<number[]>;
  captureScreenshotToFile: (elementHandle: string, path: string) => Promise<void>;
  findImage?: (elementHandle: string, template: number[]) => Promise<ImageMatch | null>;
  clickAt?: (x: number, y: number) => Promise<void>;
  findDialogs: (processId: number) => DialogInfo[];
  getDialogControls: (windowHandle: string) => DialogControl[];
  clickDialogButton: (windowHandle: string, buttonText: string) => Promise<void>;
  setDialogFilePath: (windowHandle: string, path: string) => Promise<void>;
  findProcessesByName: (imageName: string) => ProcessEntry[];
  waitForProcessExit: (processId: number, timeoutMs: number) => Promise<boolean>;
  getProcessImageName: (processId: number) => string;
  killProcess: (processId: number) => Promise<void>;
  getElementAttribute: (elementHandle: string, attributeName: string) => Promise<string>;
  keyDown: (windowHandle: string, key: string) => Promise<void>;
  keyUp: (windowHandle: string, key: string) => Promise<void>;
  selectText: (elementHandle: string) => Promise<void>;
  getSelection: (elementHandle: string) => Promise<string>;
  replaceSelectedText: (elementHandle: string, text: string) => Promise<void>;
  inspectWindowTree: (windowHandle: string, maxDepth?: number | null) => ElementNode[];
  inspectHwndTree?: (windowHandle: string, maxDepth?: number | null) => HwndNode[];
  highlightElement?: (elementHandle: string, color?: string | null, durationMs?: number | null) => Promise<void>;
  buildElementPath?: (elementHandle: string) => ElementPathStep[];
  resolveElementPath?: (windowHandle: string, path: ElementPathStep[]) => Promise<string | null>;
};

export type ProcessEntry = {
  pid: number;
  imageName: string;
};

export type DialogInfo = {
  handle: string;
  title: string;
  class_name: string;
  visible: boolean;
};

export type ImageMatch = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type LocatorFilter = {
  visible?: boolean;
  enabled?: boolean;
  focused?: boolean;
  hasText?: string;
  className?: string;
  automationId?: string;
  role?: string;
};

export type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

export type FindFirstOptions = WaitOptions & {
  /** If true, all selectors are checked on each poll cycle (default true).
   *  If false, selectors are tried sequentially until one succeeds. */
  parallel?: boolean;
};

export type DialogControl = {
  handle: string;
  name: string;
  control_type: string;
};

export type ElementNode = {
  handle: string;
  name: string;
  role: string;
  automationId: string;
  isVisible: boolean;
  isEnabled: boolean;
  children: ElementNode[];
};

export type HwndNode = {
  handle: string;
  class_name: string;
  title: string;
  visible: boolean;
  children: HwndNode[];
};

export type ElementPathStep = {
  role: string;
  name: string;
  automationId: string;
  className: string;
  siblingIndex: number;
};

export type ElementPath = ElementPathStep[];
