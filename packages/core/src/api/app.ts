import { Window } from "./window";
import { Element } from "./element";
import { loadNativeBindings } from "../native/loadNative";

export class App {
  public readonly processId: number;
  public readonly executablePath: string;
  public readonly title: string;
  private readonly initialMainWindowHandle: string | null;

  constructor(
    processId: number,
    executablePath: string,
    title: string,
    initialMainWindowHandle?: string | null,
  ) {
    this.processId = processId;
    this.executablePath = executablePath;
    this.title = title;
    this.initialMainWindowHandle = initialMainWindowHandle ?? null;
  }

  public async listWindows(): Promise<Window[]> {
    const handles = await loadNativeBindings().enumerateWindows(this.processId);
    return handles.map((handle) => new Window(handle, this.processId));
  }

  public async getMainWindow(): Promise<Window | null> {
    if (this.initialMainWindowHandle) {
      return new Window(this.initialMainWindowHandle, this.processId);
    }

    const windows = await this.listWindows();
    if (windows.length === 0) {
      return null;
    }
    return windows[0];
  }

  public async waitForMainWindow(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<Window> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const window = await this.getMainWindow();
      if (window) {
        return window;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `No top-level window found for process ${this.processId} within ${timeoutMs}ms.`,
    );
  }

  public async find(selector: {
    automationId?: string;
    name?: string;
    role?: string;
  }): Promise<Element | null> {
    const mainWindow = await this.getMainWindow();
    if (!mainWindow) {
      return null;
    }
    return mainWindow.findElement(selector);
  }

  public async close(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<void> {
    const mainWindow = await this.getMainWindow();
    if (mainWindow) {
      try {
        await mainWindow.close();
      } catch {
        // Ignore window close failure; fallback to process close.
      }
    }

    await loadNativeBindings().closeApp(this.processId);

    const timeoutMs = options?.timeoutMs ?? 5_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const processRunning = loadNativeBindings().isProcessRunning(
        this.processId,
      );
      if (!processRunning) {
        return;
      }

      const windows = await this.listWindows();
      if (windows.length === 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `App process ${this.processId} still has open windows after close()`,
    );
  }
}
