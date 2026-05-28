import type { Backend } from "./backend";
import { NativeBackend } from "./native-backend";
import { App } from "./app";
import { AutomationEvents } from "./events";
import { ProcessManager } from "./process";
import { AutomationError } from "./errors";
import type { AppSelector, LaunchOptions } from "./types";


export class Automation {
  public readonly events: AutomationEvents;
  public readonly processes: ProcessManager;
  private readonly backend: Backend;

  constructor(backend?: Backend) {
    this.backend = backend ?? Automation.detectBackend() ?? new NativeBackend();
    this.events = new AutomationEvents();
    this.processes = new ProcessManager(this.backend);
  }

  private static detectBackend(): Backend | null {
    if (process.env.WIN_AUTO_BACKEND === "mock") {
      try {
        // Lazy require to avoid circular dependency
        const { MockBackend } = require("../mock/mockBackend");
        return new MockBackend();
      } catch {
        return null;
      }
    }
    return null;
  }

  public async launch(executablePath: string): Promise<App> {
    return this.launchApp({ executablePath });
  }

  public async launchApp(options: LaunchOptions): Promise<App> {
    const processId = await this.backend.launch(options.executablePath);
    const windows = await this.backend.enumerateWindows(processId, options.executablePath);
    const initialMainWindowHandle = windows.length > 0 ? windows[0] : undefined;
    const app = new App(
      processId,
      options.executablePath,
      options.title ?? "Launched App",
      this.backend,
      this.events,
      initialMainWindowHandle,
    );
    this.events.emitAppLaunched(processId, options.executablePath);
    return app;
  }

  public async connectApp(selector: AppSelector): Promise<App> {
    if (!selector.processId) {
      throw new AutomationError(
        "connectApp currently requires processId for the native backend.",
      );
    }

    return new App(
      selector.processId,
      selector.executablePath ?? "unknown",
      selector.title ?? "Connected App",
      this.backend,
      this.events,
    );
  }

  public async connectProcess(imageName: string): Promise<App | null> {
    const matches = this.backend.findProcessesByName(imageName);
    if (matches.length === 0) {
      return null;
    }
    const entry = matches[0];
    const imagePath = this.backend.getProcessImageName(entry.pid);
    this.events.emitProcessConnected(entry.pid, entry.imageName);
    return new App(
      entry.pid,
      imagePath || entry.imageName,
      imagePath || entry.imageName,
      this.backend,
      this.events,
    );
  }

  public async mouseMove(x: number, y: number): Promise<void> {
    await this.backend.mouseMove(x, y);
    this.events.emitMouseMoved(x, y);
  }

  public pingNative(): string {
    return this.backend.ping();
  }

  public debugDiscovery(processId: number) {
    return this.backend.debugDiscovery(processId);
  }
}
