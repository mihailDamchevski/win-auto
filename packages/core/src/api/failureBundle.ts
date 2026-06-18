import fs from "fs";
import path from "path";
import type { TraceSession } from "./trace";
import type { DiagnosticsReport } from "./diagnostics";
import { getTrackedApps } from "./testAutomation";

export type FailureBundleAppEntry = {
  name: string;
  pid: number;
  windowTitle: string | null;
  elementTree: string | null;
  screenshotBase64: string | null;
  memory: {
    heapUsedMB: number;
    rssMB: number;
  };
};

export type FailureBundleData = {
  version: 1;
  createdAt: string;
  testName: string;
  durationMs: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  trace?: TraceSession;
  apps: FailureBundleAppEntry[];
  environment?: DiagnosticsReport;
  summary: {
    totalApps: number;
    totalScreenshots: number;
    totalActions: number;
    totalErrors: number;
    totalAssertions: number;
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

async function screenshotToBase64(
  screenshotFn: () => Promise<number[]>,
): Promise<string | null> {
  try {
    const bytes = await screenshotFn();
    const base64 = Buffer.from(bytes).toString("base64");
    return base64;
  } catch {
    return null;
  }
}

export class FailureBundle {
  static async capture(
    testName: string,
    options?: {
      trace?: TraceSession;
      environment?: DiagnosticsReport;
      error?: Error;
    },
  ): Promise<FailureBundleData> {
    const apps = getTrackedApps();
    const appEntries: FailureBundleAppEntry[] = [];

    for (const app of apps) {
      const entry: FailureBundleAppEntry = {
        name: app.title,
        pid: app.processId,
        windowTitle: null,
        elementTree: null,
        screenshotBase64: null,
        memory: {
          heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
          rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2),
        },
      };

      try {
        const window = await app.getMainWindow();
        if (window) {
          try {
            const info = window.getLegacyInfo();
            entry.windowTitle = info.text || null;
          } catch {
            entry.windowTitle = null;
          }
          try {
            const tree = window.inspectTree();
            entry.elementTree = formatTree(tree);
          } catch {
            entry.elementTree = null;
          }
          entry.screenshotBase64 = await screenshotToBase64(() =>
            window.screenshot(),
          );
        }
      } catch {
        // window access failed
      }

      appEntries.push(entry);
    }

    let totalActions = 0;
    let totalErrors = 0;
    let totalAssertions = 0;
    if (options?.trace) {
      totalActions = options.trace.entryCount;
      totalErrors = options.trace.errors?.length ?? 0;
      totalAssertions = options.trace.assertionFailures?.length ?? 0;
    }

    const data: FailureBundleData = {
      version: 1,
      createdAt: new Date().toISOString(),
      testName,
      durationMs: options?.trace
        ? (options.trace.endTime ?? Date.now()) - options.trace.startTime
        : 0,
      apps: appEntries,
      summary: {
        totalApps: appEntries.length,
        totalScreenshots: appEntries.filter((a) => a.screenshotBase64).length,
        totalActions,
        totalErrors,
        totalAssertions,
      },
    };

    if (options?.trace) data.trace = options.trace;
    if (options?.environment) data.environment = options.environment;
    if (options?.error) {
      data.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
      };
    }

    return data;
  }

  static toJSON(data: FailureBundleData): string {
    return JSON.stringify(data, null, 2);
  }

  static async export(data: FailureBundleData, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, FailureBundle.toJSON(data), "utf-8");
  }

  static load(filePath: string): FailureBundleData {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as FailureBundleData;
  }

  static async toHTML(data: FailureBundleData): Promise<string> {
    const traceRows = data.trace?.entries
      .map((e) => {
        const ts = new Date(e.timestamp).toISOString().slice(11, 23);
        let detail = "";
        if (e.text) detail += ` text="${escapeHtml(e.text.substring(0, 100))}"`;
        if (e.elementHandle) detail += ` handle=${e.elementHandle}`;
        if (e.processId) detail += ` pid=${e.processId}`;
        if (e.durationMs !== undefined) detail += ` +${e.durationMs}ms`;
        if (e.decision)
          detail += ` [${escapeHtml(e.decision.strategyName)} conf=${e.decision.confidence}]`;
        if (e.error)
          detail += ` error="${escapeHtml(e.error.message.substring(0, 100))}"`;
        if (e.assertionMessage)
          detail += ` assert="${escapeHtml(e.assertionMessage.substring(0, 100))}"`;
        return `<tr${e.type === "error" ? ' class="error"' : ""}${e.type === "assertion" ? ' class="assertion"' : ""}>
          <td class="ts">${ts}</td>
          <td class="type">${e.type}</td>
          <td class="detail">${detail}</td>
        </tr>`;
      })
      .join("\n") ?? "";

    const timingRows = data.trace?.timingBreakdown
      ? Object.entries(data.trace.timingBreakdown)
          .map(
            ([cat, t]) =>
              `<tr><td>${cat}</td><td>${t.count}</td><td>${t.totalMs}ms</td><td>${t.avgMs}ms</td><td>${t.minMs}ms</td><td>${t.maxMs}ms</td></tr>`,
          )
          .join("\n")
      : "";

    const appCards = data.apps
      .map(
        (a) => `
      <div class="app-card">
        <h3>${escapeHtml(a.name)} (pid ${a.pid})</h3>
        <p>Window: ${a.windowTitle ? escapeHtml(a.windowTitle) : "N/A"}</p>
        <p>Memory: ${a.memory.heapUsedMB}MB heap / ${a.memory.rssMB}MB RSS</p>
        ${a.elementTree ? `<pre class="tree">${escapeHtml(a.elementTree.substring(0, 2000))}</pre>` : ""}
        ${a.screenshotBase64 ? `<img src="data:image/png;base64,${a.screenshotBase64}" style="max-width:100%;max-height:400px" />` : ""}
      </div>`,
      )
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Failure Bundle — ${escapeHtml(data.testName)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
h1 { font-size: 1.5rem; margin-bottom: 8px; }
h2 { font-size: 1.2rem; margin: 24px 0 8px; border-bottom: 1px solid #30363d; padding-bottom: 4px; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
.stat { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; text-align: center; }
.stat .value { font-size: 1.8rem; font-weight: 600; color: #58a6ff; }
.stat .label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; }
.error-box { background: #3d1f1f; border: 1px solid #f85149; border-radius: 6px; padding: 12px; margin: 12px 0; }
.error-box h3 { color: #f85149; }
.error-box pre { margin-top: 8px; font-size: 0.85rem; white-space: pre-wrap; color: #8b949e; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.85rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #21262d; }
th { color: #8b949e; font-weight: 500; }
tr.error td.type { color: #f85149; font-weight: 600; }
tr.assertion td.type { color: #d29922; font-weight: 600; }
.ts { color: #8b949e; font-family: monospace; white-space: nowrap; }
.detail { font-family: monospace; color: #c9d1d9; white-space: pre-wrap; word-break: break-all; }
.app-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; margin: 12px 0; }
.app-card h3 { margin-bottom: 4px; }
.tree { background: #0d1117; border: 1px solid #21262d; border-radius: 4px; padding: 8px; margin-top: 8px; font-size: 0.8rem; max-height: 300px; overflow: auto; }
img { margin-top: 8px; border: 1px solid #21262d; border-radius: 4px; }
a { color: #58a6ff; }
</style>
</head>
<body>
<h1>${escapeHtml(data.testName)}</h1>
<p>${data.createdAt} · ${data.durationMs}ms</p>

<div class="summary">
  <div class="stat"><div class="value">${data.summary.totalActions}</div><div class="label">Actions</div></div>
  <div class="stat"><div class="value">${data.summary.totalErrors}</div><div class="label">Errors</div></div>
  <div class="stat"><div class="value">${data.summary.totalAssertions}</div><div class="label">Assertions</div></div>
  <div class="stat"><div class="value">${data.summary.totalApps}</div><div class="label">Apps</div></div>
  <div class="stat"><div class="value">${data.summary.totalScreenshots}</div><div class="label">Screenshots</div></div>
</div>

${data.error ? `
<div class="error-box">
  <h3>${escapeHtml(data.error.name)}</h3>
  <p>${escapeHtml(data.error.message)}</p>
  ${data.error.stack ? `<pre>${escapeHtml(data.error.stack)}</pre>` : ""}
</div>` : ""}

${timingRows ? `
<h2>Timing Breakdown</h2>
<table>
  <tr><th>Category</th><th>Count</th><th>Total</th><th>Avg</th><th>Min</th><th>Max</th></tr>
  ${timingRows}
</table>` : ""}

${traceRows ? `
<h2>Execution Trace (${data.trace?.entryCount ?? 0} entries)</h2>
<div style="max-height:500px;overflow:auto;border:1px solid #30363d;border-radius:6px;">
<table>
  <tr><th>Time</th><th>Type</th><th>Detail</th></tr>
  ${traceRows}
</table>
</div>` : ""}

${data.trace?.locatorDecisions && data.trace.locatorDecisions.length > 0 ? `
<h2>Locator Decisions (${data.trace.locatorDecisions.length})</h2>
<table>
  <tr><th>Time</th><th>Strategy</th><th>Confidence</th><th>Reason</th><th>Candidates</th></tr>
  ${data.trace.locatorDecisions.map((e) => {
    const ts = new Date(e.timestamp).toISOString().slice(11, 23);
    return `<tr><td class="ts">${ts}</td><td>${escapeHtml(e.decision?.strategyName ?? "")}</td><td>${e.decision?.confidence ?? ""}</td><td>${escapeHtml(e.decision?.reason ?? "")}</td><td>${e.decision?.candidates ?? 0}</td></tr>`;
  }).join("\n")}
</table>` : ""}

<h2>Tracked Apps (${data.apps.length})</h2>
${appCards}

${data.environment ? `
<h2>Environment</h2>
<pre style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px;font-size:0.85rem;">${escapeHtml(JSON.stringify(data.environment, null, 2))}</pre>` : ""}
</body>
</html>`;
  }

  static async exportHTML(data: FailureBundleData, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const html = await FailureBundle.toHTML(data);
    fs.writeFileSync(filePath, html, "utf-8");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
