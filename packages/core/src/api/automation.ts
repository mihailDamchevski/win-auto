import { App } from "./app";
import type { AppSelector, LaunchOptions } from "./types";
import { DEFAULT_NOTEPAD_CLASS_NAMES } from "../native/classNames";
import { loadNativeBindings } from "../native/loadNative";

export class Automation {
  public async launch(executablePath: string): Promise<App> {
    return this.launchApp({ executablePath });
  }

  public async launchApp(options: LaunchOptions): Promise<App> {
    const native = loadNativeBindings();
    if (native.setAppConfig) {
      const classNames = options.executablePath.toLowerCase().includes("notepad.exe")
        ? DEFAULT_NOTEPAD_CLASS_NAMES
        : [];
      native.setAppConfig(options.executablePath, classNames);
    }
    const processId = await native.launch(options.executablePath);
    return new App(processId, options.executablePath, options.title ?? "Launched App");
  }

  public async connectApp(selector: AppSelector): Promise<App> {
    if (!selector.processId) {
      throw new Error("connectApp currently requires processId for the native backend.");
    }

    return new App(
      selector.processId,
      selector.executablePath ?? "unknown",
      selector.title ?? "Connected App"
    );
  }

  public pingNative(): string {
    return loadNativeBindings().ping();
  }

  public debugDiscovery(processId: number) {
    const native = loadNativeBindings();
    if (!native.debugDiscovery) {
      throw new Error("debugDiscovery is not available in the loaded native module.");
    }
    return native.debugDiscovery(processId);
  }
}
