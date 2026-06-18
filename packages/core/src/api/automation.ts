import type { Backend, WinEventInfo } from "./backend";
import { NativeBackend } from "./native-backend";
import { App } from "./app";
import { AutomationEvents } from "./events";
import { ProcessManager } from "./process";
import { AutomationError } from "./errors";
import { WaitBuilder } from "./wait";
import { Diagnostics } from "./diagnostics";
import { loadNativeBindings } from "../native/loadNative";
import type { NativeBindings, AppSelector, InputMode, LaunchOptions } from "./types";

export class Automation {
  public readonly events: AutomationEvents;
  public readonly processes: ProcessManager;
  public readonly wait: WaitBuilder;
  public readonly diagnostics: Diagnostics;
  public readonly inputMode: InputMode;
  public readonly backend: Backend;
  private nativeBindings?: NativeBindings;

  constructor(backend?: Backend, inputMode?: InputMode) {
    this.backend = backend ?? Automation.detectBackend() ?? new NativeBackend();
    this.inputMode = inputMode ?? "auto";
    this.events = new AutomationEvents();
    this.processes = new ProcessManager(this.backend);
    this.wait = new WaitBuilder(this.backend);
    try {
      this.nativeBindings = loadNativeBindings();
    } catch {
      // Native module not available
    }
    this.diagnostics = new Diagnostics(this.backend, this.nativeBindings);
  }

  private static detectBackend(): Backend | null {
    if (process.env.WIN_AUTO_BACKEND === "mock") {
      // Guard against ESM context where require() is not defined
      if (typeof require === "undefined") return null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MockBackend } = require("../mock/mockBackend");
        return new MockBackend();
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Async factory for ESM environments where mock backend cannot be loaded
   *  via synchronous require(). Falls through to NativeBackend on failure. */
  static async create(backend?: Backend, inputMode?: InputMode): Promise<Automation> {
    if (!backend && process.env.WIN_AUTO_BACKEND === "mock") {
      try {
        const { MockBackend } = await import("../mock/mockBackend.js");
        backend = new MockBackend();
      } catch {
        // NativeBackend fallback
      }
    }
    return new Automation(backend, inputMode);
  }

  public async launch(executablePath: string): Promise<App> {
    return this.launchApp({ executablePath });
  }

  private normalizeEnv(env?: string[] | Record<string, string>): string[] | undefined {
    if (env === undefined) return undefined;
    if (Array.isArray(env)) return env;
    return Object.entries(env).map(([k, v]) => `${k}=${v}`);
  }

  public async launchApp(options: LaunchOptions): Promise<App> {
    const hasAdvancedOpts =
      options.args !== undefined ||
      options.cwd !== undefined ||
      options.env !== undefined ||
      options.runAs !== undefined ||
      options.job !== undefined ||
      options.createNoWindow !== undefined ||
      options.aumid !== undefined;

    const env = this.normalizeEnv(options.env);

    const processId = hasAdvancedOpts
      ? await this.backend.launchProcess(options.executablePath, {
          args: options.args,
          cwd: options.cwd,
          env,
          runAs: options.runAs,
          job: options.job,
          createNoWindow: options.createNoWindow,
          aumid: options.aumid,
        })
      : await this.backend.launch(options.executablePath);
    const windows = await this.backend.enumerateWindows(processId, options.executablePath);
    const initialMainWindowHandle = windows.length > 0 ? windows[0] : undefined;
    const app = new App(
      processId,
      options.executablePath,
      options.title ?? "Launched App",
      this.backend,
      this.events,
      initialMainWindowHandle,
      this.inputMode,
    );
    this.events.emitAppLaunched(processId, options.executablePath);
    return app;
  }

  public async connectApp(selector: AppSelector): Promise<App> {
    if (!selector.processId) {
      throw new AutomationError("connectApp currently requires processId for the native backend.");
    }

    const appInputMode = selector.mode === "background" ? "pattern" : this.inputMode;

    return new App(
      selector.processId,
      selector.executablePath ?? "unknown",
      selector.title ?? "Connected App",
      this.backend,
      this.events,
      undefined,
      appInputMode,
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
      undefined,
      this.inputMode,
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

  public startWinEventWatcher(): void {
    this.backend.startWinEventWatcher((event: WinEventInfo) => {
      this.events.emitWinEvent(
        event.eventType,
        event.hwnd,
        event.idObject,
        event.idChild,
        event.idEventThread,
        event.timestamp,
      );
    });
  }

  public stopWinEventWatcher(): void {
    this.backend.stopWinEventWatcher();
  }
}
