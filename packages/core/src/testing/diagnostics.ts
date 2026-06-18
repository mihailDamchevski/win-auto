import fs from "fs";
import path from "path";
import { getTrackedApps } from "../api/testAutomation";

type DiagnosticEntry = {
  timestamp: string;
  app: string;
  pid: number;
  windowTitle: string | null;
  windowHandle: string | null;
  elementTree: string | null;
  screenshot: string | null;
  memory: {
    heapUsedMB: number;
    rssMB: number;
    externalMB: number;
  };
};

type DiagnosticBundle = {
  testFailed: string;
  capturedAt: string;
  entries: DiagnosticEntry[];
  summary: {
    totalApps: number;
    totalScreenshots: number;
    heapUsedMB: number;
  };
};

function formatTree(nodes: unknown[], depth = 0): string {
  const indent = "  ".repeat(depth);
  let result = "";
  for (const node of nodes) {
    const n = node as Record<string, unknown>;
    const info = [
      n.role && `role="${n.role}"`,
      n.name && `name="${n.name}"`,
      n.automationId && `id="${n.automationId}"`,
      n.isVisible === false && "hidden",
      n.isEnabled === false && "disabled",
    ]
      .filter(Boolean)
      .join(" ");
    result += `${indent}<${n.role || "node"} ${info}>\n`;
    if (Array.isArray(n.children) && n.children.length > 0) {
      result += formatTree(n.children, depth + 1);
    }
  }
  return result;
}

export async function captureDiagnosticBundle(
  testName: string,
  dir?: string,
): Promise<DiagnosticBundle> {
  const bundleDir = dir ?? "diagnostics";
  if (!fs.existsSync(bundleDir)) {
    fs.mkdirSync(bundleDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const testDir = path.join(bundleDir, `${timestamp}_${testName.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
  fs.mkdirSync(testDir, { recursive: true });

  const apps = getTrackedApps();
  const entries: DiagnosticEntry[] = [];
  let totalScreenshots = 0;

  for (const app of apps) {
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      app: app.title,
      pid: app.processId,
      windowTitle: null,
      windowHandle: null,
      elementTree: null,
      screenshot: null,
      memory: {
        heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2),
        externalMB: +(process.memoryUsage().external / 1024 / 1024).toFixed(2),
      },
    };

    try {
      const window = await app.getMainWindow();
      if (window) {
        entry.windowHandle = window.handle;
        try {
          const info = window.getLegacyInfo();
          entry.windowTitle = info.text || null;
        } catch {
          entry.windowTitle = null;
        }

        try {
          const tree = window.inspectTree();
          entry.elementTree = formatTree(tree);
          const treePath = path.join(testDir, `tree_${app.processId}.txt`);
          fs.writeFileSync(treePath, entry.elementTree, "utf-8");
        } catch {
          // element tree unavailable
        }

        try {
          const screenshotPath = path.join(testDir, `screenshot_${app.processId}.png`);
          await window.screenshotToFile(screenshotPath);
          entry.screenshot = screenshotPath;
          totalScreenshots++;
        } catch {
          // screenshot unavailable
        }
      }
    } catch {
      // window access failed
    }

    entries.push(entry);
  }

  const mem = process.memoryUsage();
  const bundle: DiagnosticBundle = {
    testFailed: testName,
    capturedAt: new Date().toISOString(),
    entries,
    summary: {
      totalApps: apps.length,
      totalScreenshots,
      heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(2),
    },
  };

  const bundlePath = path.join(testDir, "bundle.json");
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf-8");

  return bundle;
}
