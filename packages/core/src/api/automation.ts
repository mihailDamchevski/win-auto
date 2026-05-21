import type { Backend } from "./backend";
import { NativeBackend } from "./native-backend";
import { App } from "./app";
import type { AppSelector, LaunchOptions } from "./types";
import { DEFAULT_NOTEPAD_CLASS_NAMES } from "../native/classNames";

export class Automation {
  private readonly backend: Backend;

  constructor(backend?: Backend) {
    this.backend = backend ?? new NativeBackend();
  }

  public async launch(executablePath: string): Promise<App> {
    return this.launchApp({ executablePath });
  }

  public async launchApp(options: LaunchOptions): Promise<App> {
    const classNames = options.executablePath
      .toLowerCase()
      .includes("notepad.exe")
      ? DEFAULT_NOTEPAD_CLASS_NAMES
      : [];
    this.backend.setAppConfig(options.executablePath, classNames);

    const processId = await this.backend.launch(options.executablePath);
    const windows = await this.backend.enumerateWindows(processId);
    const initialMainWindowHandle = windows.length > 0 ? windows[0] : undefined;
    return new App(
      processId,
      options.executablePath,
      options.title ?? "Launched App",
      this.backend,
      initialMainWindowHandle,
    );
  }

  public async connectApp(selector: AppSelector): Promise<App> {
    if (!selector.processId) {
      throw new Error(
        "connectApp currently requires processId for the native backend.",
      );
    }

    return new App(
      selector.processId,
      selector.executablePath ?? "unknown",
      selector.title ?? "Connected App",
      this.backend,
    );
  }

  public pingNative(): string {
    return this.backend.ping();
  }

  public debugDiscovery(processId: number) {
    return this.backend.debugDiscovery(processId);
  }
}
