import { Automation, NativeBackend } from "@win-auto/core";
import type { ElementNode, HwndNode } from "@win-auto/core";

export type DiagnoseOptions = {
  pid?: number;
  name?: string;
  tree?: boolean;
  hwnd?: boolean;
  uia?: boolean;
  events?: boolean;
  recommend?: boolean;
  output?: string;
};

function printSection(title: string): void {
  process.stdout.write(`\n${"=".repeat(60)}\n`);
  process.stdout.write(`  ${title}\n`);
  process.stdout.write(`${"=".repeat(60)}\n`);
}

function printKV(key: string, value: unknown): void {
  process.stdout.write(`  ${key.padEnd(30)} ${value}\n`);
}

function printTree(nodes: ElementNode[], indent = 0): void {
  const indentStr = "  ".repeat(indent);
  for (const node of nodes) {
    const vis = !node.isVisible ? " [hidden]" : "";
    const ena = !node.isEnabled ? " [disabled]" : "";
    process.stdout.write(`${indentStr}${node.role || "?"} "${node.name || ""}"${vis}${ena} (${node.handle})\n`);
    if (node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

function printHwndTree(nodes: HwndNode[], indent = 0): void {
  const indentStr = "  ".repeat(indent);
  for (const node of nodes) {
    const vis = node.visible ? "" : " [hidden]";
    process.stdout.write(`${indentStr}${node.class_name} "${node.title || ""}"${vis} (${node.handle})\n`);
    if (node.children.length > 0) {
      printHwndTree(node.children, indent + 1);
    }
  }
}

export async function diagnoseCommand(options: DiagnoseOptions): Promise<void> {
  let backend: NativeBackend | null = null;
  try {
    backend = new NativeBackend();
  } catch {
    // NativeBackend may fail to load native module
  }

  const auto = backend ? new Automation(backend) : new Automation();

  // ── Environment Diagnostics ──────────────────────────────────────
  printSection("Environment Diagnostics");
  try {
    const report = await auto.diagnostics.collect();
    printKV("OS Version", report.os.version);
    printKV("OS Edition", report.os.edition);
    printKV("OS Build", report.os.build);
    printKV("Displays", `${report.displays.length}`);
    for (let i = 0; i < report.displays.length; i++) {
      const d = report.displays[i];
      printKV(`  Display ${i + 1}`, `${d.width}x${d.height} @ ${d.scale}x`);
    }
    printKV("UIA Available", report.uia.available ? "Yes" : "No");
    printKV("UIA Version", report.uia.version || "N/A");
    printKV("Native Version", report.native.version);
    printKV("Native Functions", `${report.native.functions.length}`);
    printKV("Total Processes", report.processes.total);
    printKV("Elevated Processes", report.processes.elevated);

    if (options.output) {
      await auto.diagnostics.export(options.output);
      process.stdout.write(`\n  Report saved to: ${options.output}\n`);
    }
  } catch (err) {
    process.stdout.write(`  Failed to collect diagnostics: ${(err as Error).message}\n`);
  }

  // ── Target process ───────────────────────────────────────────────
  let targetPid = options.pid;
  if (!targetPid && options.name && backend) {
    try {
      const processes = backend.findProcessesByName(options.name);
      if (processes.length > 0) {
        targetPid = processes[0].pid;
      }
    } catch {
      // ignore
    }
  }

  if (targetPid && backend) {
    process.stdout.write(`\n  Target PID: ${targetPid}\n`);
    try {
      const elevated = backend.isProcessElevated(targetPid);
      printKV("Elevated", elevated ? "Yes" : "No");
    } catch {
      // ignore
    }

    if (options.tree) {
      printSection("UIA Element Tree");
      try {
        const windows = await backend.enumerateWindows(targetPid);
        for (const wh of windows) {
          const tree = backend.inspectWindowTree(wh, 5);
          printTree(tree);
        }
      } catch (err) {
        process.stdout.write(`  Failed to get UIA tree: ${(err as Error).message}\n`);
      }
    }

    if (options.hwnd) {
      printSection("HWND Tree");
      try {
        const windows = await backend.enumerateWindows(targetPid);
        for (const wh of windows) {
          const tree = backend.inspectHwndTree(wh, 5);
          printHwndTree(tree);
        }
      } catch (err) {
        process.stdout.write(`  Failed to get HWND tree: ${(err as Error).message}\n`);
      }
    }

    if (options.uia) {
      printSection("UIA Patterns (first 20 elements)");
      try {
        const windows = await backend.enumerateWindows(targetPid);
        for (const wh of windows) {
          const handles = await backend.findAll(wh, null);
          for (const elHandle of handles.slice(0, 20)) {
            try {
              const name = await backend.getText(elHandle);
              const role = await backend.getElementAttribute(elHandle, "role");
              process.stdout.write(`  ${elHandle}: "${name || "(unnamed)"}" (${role || "unknown"})\n`);
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        process.stdout.write(`  Failed to enumerate UIA: ${(err as Error).message}\n`);
      }
    }

    if (options.recommend) {
      printSection("Recommended Selectors");
      try {
        const windows = await backend.enumerateWindows(targetPid);
        for (const wh of windows) {
          const handles = await backend.findAll(wh, null);
          for (const elHandle of handles.slice(0, 30)) {
            try {
              const name = await backend.getText(elHandle);
              const role = await backend.getElementAttribute(elHandle, "role");
              const autoId = await backend.getElementAttribute(elHandle, "automationId");
              const className = await backend.getElementAttribute(elHandle, "className");
              if (name || role || autoId || className) {
                const parts: string[] = [];
                if (name) parts.push(`name: "${name}"`);
                if (role) parts.push(`role: "${role}"`);
                if (autoId) parts.push(`automationId: "${autoId}"`);
                if (className) parts.push(`className: "${className}"`);
                process.stdout.write(`  { ${parts.join(", ")} }\n`);
              }
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        process.stdout.write(`  Failed to generate recommendations: ${(err as Error).message}\n`);
      }
    }

    if (options.events) {
      printSection("Live Event Monitor (Ctrl+C to stop)");
      auto.startWinEventWatcher();
      auto.events.on("winEvent", (event: { eventType: number; hwnd: string }) => {
        const ts = new Date().toISOString().slice(11, 23);
        process.stdout.write(`  [${ts}] event=${event.eventType} hwnd=${event.hwnd}\n`);
      });
      await new Promise(() => {}); // Run until Ctrl+C
    }
  }

  if (!targetPid && !options.name) {
    process.stdout.write("\n  Use --pid <pid> or --name <imageName> for process-specific diagnostics.\n");
    process.stdout.write("  Options: --tree, --hwnd, --uia, --events, --recommend, --output <file>\n\n");
  }
}
