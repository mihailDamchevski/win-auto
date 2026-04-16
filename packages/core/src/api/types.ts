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

export type NativeBindings = {
  ping: () => string;
  launch: (executablePath: string) => Promise<number>;
  enumerateWindows: (processId: number) => Promise<string[]>;
  findElement: (
    windowHandle: string,
    automationId?: string,
    name?: string,
    role?: string
  ) => Promise<string | null>;
  typeText: (elementHandle: string, text: string) => Promise<void>;
};
