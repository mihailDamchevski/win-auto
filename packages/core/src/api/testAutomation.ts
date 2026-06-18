import fs from "fs";
import path from "path";
import { Automation } from "./automation";
import type { LaunchOptions } from "./types";
import type { App } from "./app";

const launchedApps = new Set<App>();

export function trackApp(app: App): App {
  launchedApps.add(app);
  return app;
}

export function getTrackedApps(): App[] {
  return [...launchedApps];
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
    }),
  );
}

export async function captureScreenshotsFromTrackedApps(dir?: string): Promise<string[]> {
  const saved: string[] = [];
  const screenshotDir = dir ?? "screenshots";
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  for (const app of launchedApps) {
    try {
      const window = await app.getMainWindow();
      if (window) {
        const filePath = path.resolve(
          screenshotDir,
          `${Date.now()}_${app.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`,
        );
        await window.screenshotToFile(filePath);
        saved.push(filePath);
      }
    } catch {
      // best-effort
    }
  }
  return saved;
}

export class TestAutomation extends Automation {
  /** If deterministic, automatically start recording on construction. */
  constructor(backend?: import("./backend").Backend, inputMode?: import("./types").InputMode, traceEnabled?: boolean, deterministic?: boolean) {
    super(backend, inputMode, traceEnabled, deterministic);
    if (deterministic && this.recorder) {
      this.recorder.start();
    }
  }

  public override async launchApp(options: LaunchOptions): Promise<App> {
    const app = await super.launchApp(options);
    if (this.recorder?.isRecording()) {
      await this.recorder.recordAction("app:launched", {
        pid: app.processId,
        executablePath: options.executablePath,
      });
    }
    return trackApp(app);
  }
}
