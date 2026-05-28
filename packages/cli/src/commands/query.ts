import { NativeBackend } from "@win-auto/core";
import type { ElementNode, HwndNode } from "@win-auto/core";

function formatHandle(h: string): string {
  return h.startsWith("0x") ? h : `0x${parseInt(h, 10).toString(16)}`;
}

function printElement(node: ElementNode, indent = 0): void {
  const indentStr = "  ".repeat(indent);
  const label = [node.name, node.role, node.automationId].filter(Boolean).join(" | ");
  process.stdout.write(`${indentStr}${formatHandle(node.handle)} ${label}\n`);
  for (const child of node.children) {
    printElement(child, indent + 1);
  }
}

interface QueryOptions {
  name?: string;
  role?: string;
  automationId?: string;
  className?: string;
  text?: string;
  matchMode?: string;
  findAll?: boolean;
  hwnd?: boolean;
  highlight?: boolean;
}

export async function queryCommand(target: string, options: QueryOptions): Promise<void> {
  const backend = new NativeBackend();
  const pid = Number(target);
  let handles: string[];
  let pidToUse: number;

  if (!Number.isNaN(pid)) {
    pidToUse = pid;
    handles = await backend.enumerateWindows(pidToUse);
  } else {
    const processes = backend.findProcessesByName(target);
    if (processes.length === 0) {
      process.stdout.write(`No processes found matching "${target}"\n`);
      return;
    }
    pidToUse = processes[0].pid;
    process.stdout.write(`Using process: ${processes[0].imageName} (PID: ${processes[0].pid})\n`);
    handles = await backend.enumerateWindows(pidToUse);
  }

  if (handles.length === 0) {
    process.stdout.write(`No windows found for target\n`);
    return;
  }

  for (const winHandle of handles) {
    process.stdout.write(`\nWindow: ${formatHandle(winHandle)} (PID: ${pidToUse})\n`);

    if (options.hwnd) {
      const tree: HwndNode[] = backend.inspectHwndTree(winHandle, 5);
      for (const node of tree) {
        printHwndNode(node, 2);
      }
    } else {
      const tree: ElementNode[] = backend.inspectWindowTree(winHandle, 5);
      for (const node of tree) {
        printElement(node, 2);
      }
    }

    // Try the selector query
    const selectorFields = {
      automationId: options.automationId ?? null,
      name: options.name ?? null,
      role: options.role ?? null,
      className: options.className ?? null,
      text: options.text ?? null,
      matchMode: options.matchMode ?? null,
    };

    const hasSelector = Object.values(selectorFields).some((v) => v != null);
    if (!hasSelector) {
      continue;
    }

    if (options.findAll) {
      const results = await backend.findAll(
        winHandle,
        null,
        selectorFields.automationId,
        selectorFields.name,
        selectorFields.role,
        selectorFields.className,
        selectorFields.text,
        selectorFields.matchMode,
      );
      process.stdout.write(`  Query results (${results.length} matches):\n`);
      for (const h of results) {
        try {
          const name = await backend.getElementAttribute(h, "name");
          const role = await backend.getElementAttribute(h, "role");
          const autoId = await backend.getElementAttribute(h, "automationId");
          process.stdout.write(`    ${formatHandle(h)} ${name} | ${role} | ${autoId}\n`);
        } catch {
          process.stdout.write(`    ${formatHandle(h)}\n`);
        }
        if (options.highlight) {
          try {
            await backend.highlightElement(h, null, 1500);
          } catch {
            // highlight not available
          }
        }
      }
    } else {
      const result = await backend.findElement(
        winHandle,
        null,
        selectorFields.automationId,
        selectorFields.name,
        selectorFields.role,
        selectorFields.className,
        selectorFields.text,
        selectorFields.matchMode,
      );
      if (result) {
        process.stdout.write(`  Query result: ${formatHandle(result)}\n`);
        try {
          const name = await backend.getElementAttribute(result, "name");
          const role = await backend.getElementAttribute(result, "role");
          const autoId = await backend.getElementAttribute(result, "automationId");
          const bounds = await backend.getElementAttribute(result, "bounds");
          process.stdout.write(`    Name: ${name}\n`);
          process.stdout.write(`    Role: ${role}\n`);
          process.stdout.write(`    AutomationId: ${autoId}\n`);
          process.stdout.write(`    Bounds: ${bounds}\n`);
        } catch {
          // attributes not available
        }
        if (options.highlight) {
          try {
            await backend.highlightElement(result, null, 3000);
          } catch {
            process.stdout.write(`    (highlight unavailable)\n`);
          }
        }
      } else {
        process.stdout.write(`  No match found for selector\n`);
      }
    }
  }
}

function printHwndNode(node: HwndNode, indent = 0): void {
  const indentStr = "  ".repeat(indent);
  const visible = node.visible ? "" : " hidden";
  const title = node.title ? ` "${node.title}"` : "";
  process.stdout.write(
    `${indentStr}${formatHandle(node.handle)} [${node.class_name}]${title}${visible}\n`,
  );
  for (const child of node.children) {
    printHwndNode(child, indent + 1);
  }
}
