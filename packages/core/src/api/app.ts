import { Window } from "./window";
import { Element } from "./element";
import { loadNativeBindings } from "../native/loadNative";

export class App {
  public readonly processId: number;
  public readonly executablePath: string;
  public readonly title: string;

  constructor(processId: number, executablePath: string, title: string) {
    this.processId = processId;
    this.executablePath = executablePath;
    this.title = title;
  }

  public async listWindows(): Promise<Window[]> {
    const handles = await loadNativeBindings().enumerateWindows(this.processId);
    return handles.map((handle) => new Window(handle, this.processId));
  }

  public async getMainWindow(): Promise<Window | null> {
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
      `No top-level window found for process ${this.processId} within ${timeoutMs}ms.`
    );
  }

  public async find(selector: { automationId?: string; name?: string; role?: string }): Promise<Element | null> {
    const mainWindow = await this.getMainWindow();
    if (!mainWindow) {
      return null;
    }
    return mainWindow.findElement(selector);
  }

  public async close(): Promise<void> {
    await loadNativeBindings().closeApp(this.processId);
  }
}
