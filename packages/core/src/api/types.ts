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

export type ElementSelector = {
  automationId?: string;
  name?: string;
  role?: string;
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

export type NativeBindings = {
  ping: () => string;
  setAppConfig?: (executable: string, classNames: string[]) => void;
  launch: (executablePath?: string | null) => Promise<number>;
  enumerateWindows: (processId: number) => Promise<string[]>;
  debugDiscovery?: (processId: number) => WindowDebugInfo[];
  findElement: (
    windowHandle: string,
    classNames?: string[] | null,
    automationId?: string | null,
    name?: string | null,
    role?: string | null
  ) => Promise<string | null>;
  typeText: (elementHandle: string, text: string) => Promise<void>;
  closeApp: (processId: number) => Promise<void>;
};
