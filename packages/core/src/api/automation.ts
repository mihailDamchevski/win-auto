import { App } from "./app";
import type { AppSelector, LaunchOptions } from "./types";
import { loadNativeBindings } from "../native/loadNative";

export class Automation {
  public async launch(executablePath: string): Promise<App> {
    return this.launchApp({ executablePath });
  }

  public async launchApp(options: LaunchOptions): Promise<App> {
    const processId = await loadNativeBindings().launch(options.executablePath);
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
}
