import type { Backend } from "./backend";
import type { ElementNode, ElementSelector, WaitOptions } from "./types";

const MAX_ELEMENTS_IN_ERROR = 8;
const MAX_TREE_DEPTH = 2;

function formatSelector(selector: ElementSelector): string {
  const parts: string[] = [];
  if (selector.name) parts.push(`name="${selector.name}"`);
  if (selector.role) parts.push(`role="${selector.role}"`);
  if (selector.automationId) parts.push(`automationId="${selector.automationId}"`);
  if (selector.className) parts.push(`className="${selector.className}"`);
  if (selector.text) parts.push(`text="${selector.text}"`);
  if (selector.matchMode) parts.push(`matchMode="${selector.matchMode}"`);
  if (parts.length === 0) return "(empty selector)";
  return parts.join(", ");
}

function flattenTree(nodes: ElementNode[], depth: number, maxDepth: number, indent: string): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    const attrs = [
      node.name ? `"${node.name}"` : "",
      node.role || "",
      node.automationId ? `#${node.automationId}` : "",
    ].filter(Boolean).join(" ");
    lines.push(`${indent}${node.handle} ${attrs || "(unnamed)"}`);
    if (depth < maxDepth && node.children.length > 0) {
      lines.push(...flattenTree(node.children.slice(0, 3), depth + 1, maxDepth, indent + "  "));
    }
  }
  return lines;
}

function formatTree(tree: ElementNode[]): string {
  const lines = flattenTree(tree, 0, MAX_TREE_DEPTH, "  ");
  if (lines.length > MAX_ELEMENTS_IN_ERROR) {
    lines.splice(MAX_ELEMENTS_IN_ERROR);
    lines.push(`  ... and ${lines.length - MAX_ELEMENTS_IN_ERROR} more`);
  }
  return lines.join("\n");
}

export async function buildElementNotFoundError(
  windowHandle: string,
  selector: ElementSelector,
  backend: Backend,
  options?: WaitOptions,
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const selectorStr = formatSelector(selector);

  let treeMsg = "";
  try {
    const tree = await backend.inspectWindowTree(windowHandle, MAX_TREE_DEPTH);
    if (tree.length > 0) {
      treeMsg = `\nAvailable elements in window:\n${formatTree(tree)}`;
    }
  } catch {
    treeMsg = "\n(Could not inspect window tree)";
  }

  return (
    `Element not found after ${timeoutMs}ms\n` +
    `  Selector: { ${selectorStr} }\n` +
    `  Window handle: ${windowHandle}${treeMsg}`
  );
}

export async function buildWindowNotFoundError(
  processId: number,
  timeoutMs: number,
  backend: Backend,
): Promise<string> {
  let processesMsg = "";
  try {
    const imageName = backend.getProcessImageName(processId);
    if (imageName) {
      processesMsg = `\n  Process image: ${imageName}`;
    }
  } catch {
    // ignore
  }

  return (
    `No top-level window found for process ${processId} within ${timeoutMs}ms.` +
    processesMsg +
    `\n  Verify the process is running and has a visible window.`
  );
}

export { formatSelector };
