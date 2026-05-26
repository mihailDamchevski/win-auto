import { Automation, NativeBackend } from "@win-auto/core";
import type { ElementNode, HwndNode } from "@win-auto/core";

function printTree(node: ElementNode, indent = 0): void {
  const indentStr = "  ".repeat(indent);
  const label = [node.name, node.role, node.automationId].filter(Boolean).join(" | ");
  const disabled = !node.isEnabled ? " disabled" : "";
  const hidden = !node.isVisible ? " hidden" : "";
  process.stdout.write(`${indentStr}${node.handle} ${label}${disabled}${hidden}\n`);
  for (const child of node.children) {
    printTree(child, indent + 1);
  }
}

function printHwndTree(node: HwndNode, indent = 0): void {
  const indentStr = "  ".repeat(indent);
  const visible = node.visible ? "" : " hidden";
  const title = node.title ? ` "${node.title}"` : "";
  process.stdout.write(`${indentStr}${node.handle} [${node.class_name}]${title}${visible}\n`);
  for (const child of node.children) {
    printHwndTree(child, indent + 1);
  }
}

function formatHandle(h: string): string {
  return h.startsWith("0x") ? h : `0x${parseInt(h, 10).toString(16)}`;
}

export async function inspectCommand(target: string, maxDepth?: number, hwnd?: boolean): Promise<void> {
  const backend = new NativeBackend();
  const pid = Number(target);

  if (!Number.isNaN(pid)) {
    const windows = await backend.enumerateWindows(pid);
    if (windows.length === 0) {
      process.stdout.write(`No windows found for PID ${pid}\n`);
      return;
    }
    for (const winHandle of windows) {
      process.stdout.write(`\nWindow: ${formatHandle(winHandle)}\n`);
      process.stdout.write(`  PID: ${pid}\n`);
      try {
        const bounds = await backend.getWindowBounds(winHandle);
        process.stdout.write(`  Bounds: ${bounds.left},${bounds.top} ${bounds.width}x${bounds.height}\n`);
      } catch {
        process.stdout.write(`  Bounds: (unavailable)\n`);
      }
      if (hwnd) {
        try {
          const tree = backend.inspectHwndTree(winHandle, maxDepth ?? 5);
          process.stdout.write(`  HWND Tree:\n`);
          for (const node of tree) {
            printHwndTree(node, 2);
          }
        } catch {
          process.stdout.write(`  (HWND tree unavailable — try without --hwnd)\n`);
        }
      } else {
        const tree = backend.inspectWindowTree(winHandle, maxDepth ?? 5);
        process.stdout.write(`  UIA Tree:\n`);
        for (const node of tree) {
          printTree(node, 2);
        }
      }
    }
    return;
  }

  // Try as image name
  const processes = backend.findProcessesByName(target);
  if (processes.length === 0) {
    process.stdout.write(`No processes found matching "${target}"\n`);
    return;
  }
  for (const proc of processes) {
    process.stdout.write(`\nProcess: ${proc.imageName} (PID: ${proc.pid})\n`);
    const windows = await backend.enumerateWindows(proc.pid);
    if (windows.length === 0) {
      process.stdout.write(`  No windows found\n`);
      continue;
    }
    for (const winHandle of windows) {
      process.stdout.write(`  Window: ${formatHandle(winHandle)}\n`);
      try {
        const bounds = await backend.getWindowBounds(winHandle);
        process.stdout.write(`    Bounds: ${bounds.left},${bounds.top} ${bounds.width}x${bounds.height}\n`);
      } catch {
        process.stdout.write(`    Bounds: (unavailable)\n`);
      }
      try {
        if (hwnd) {
          const tree = backend.inspectHwndTree(winHandle, maxDepth ?? 3);
          process.stdout.write(`    HWND Tree:\n`);
          for (const node of tree) {
            printHwndTree(node, 3);
          }
        } else {
          const tree = backend.inspectWindowTree(winHandle, maxDepth ?? 3);
          process.stdout.write(`    UIA Tree:\n`);
          for (const node of tree) {
            printTree(node, 3);
          }
        }
      } catch {
        process.stdout.write(`    (tree unavailable)\n`);
      }
    }
  }
}
