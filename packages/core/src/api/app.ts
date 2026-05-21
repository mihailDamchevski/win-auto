import type { Backend } from "./backend";
import { Window } from "./window";
import { Element } from "./element";
import { DialogManager } from "./dialog";
import type { AutomationEvents } from "./events";

export class App {
  public readonly processId: number;
  public readonly executablePath: string;
  public readonly title: string;
  public readonly dialogs: DialogManager;
  private readonly initialMainWindowHandle: string | null;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;

  constructor(
    processId: number,
    executablePath: string,
    title: string,
    backend: Backend,
    events: AutomationEvents,
    initialMainWindowHandle?: string | null,
  ) {
    this.processId = processId;
    this.executablePath = executablePath;
    this.title = title;
    this.backend = backend;
    this.events = events;
    this.dialogs = new DialogManager(processId, backend, events);
    this.initialMainWindowHandle = initialMainWindowHandle ?? null;
  }

  public async listWindows(): Promise<Window[]> {
    const handles = await this.backend.enumerateWindows(this.processId);
    return handles.map((handle) => new Window(handle, this.processId, this.backend, this.events));
  }

  public async getMainWindow(): Promise<Window | null> {
    if (this.initialMainWindowHandle) {
      this.events.emitWindowFound(this.initialMainWindowHandle, this.processId);
      return new Window(this.initialMainWindowHandle, this.processId, this.backend, this.events);
    }

    const windows = await this.listWindows();
    if (windows.length === 0) {
      return null;
    }
    this.events.emitWindowFound(windows[0].handle, this.processId);
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

    await this.backend.closeApp(this.processId);

    const timeoutMs = options?.timeoutMs ?? 5_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const processRunning = this.backend.isProcessRunning(
        this.processId,
      );
      if (!processRunning) {
        this.events.emitAppClosed(this.processId);
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

  public async waitForExit(timeoutMs?: number): Promise<boolean> {
    return this.backend.waitForProcessExit(this.processId, timeoutMs ?? 30_000);
  }

  public async isRunning(): Promise<boolean> {
    return this.backend.isProcessRunning(this.processId);
  }

  public async kill(): Promise<void> {
    await this.backend.killProcess(this.processId);
    this.events.emitProcessKilled(this.processId);
  }
}
