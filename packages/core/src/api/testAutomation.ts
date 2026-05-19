import { Automation } from "./automation";
import type { LaunchOptions } from "./types";
import type { App } from "./app";

const launchedApps = new Set<App>();

export function trackApp(app: App): App {
  launchedApps.add(app);
  return app;
}

export async function closeTrackedApps(): Promise<void> {
  const apps = [...launchedApps];
  launchedApps.clear();
  await Promise.all(
    apps.map(async (app) => {
      try {
        await app.close();
      } catch {
        // Best-effort cleanup between tests.
      }
    })
  );
}

export class TestAutomation extends Automation {
  public override async launchApp(options: LaunchOptions): Promise<App> {
    const app = await super.launchApp(options);
    return trackApp(app);
  }
}
