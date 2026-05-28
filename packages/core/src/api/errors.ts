import type { Backend } from "./backend";
import type { ElementNode, ElementSelector, WaitOptions } from "./types";

const MAX_ELEMENTS_IN_ERROR = 8;
const MAX_TREE_DEPTH = 2;

// ─── Error class hierarchy ─────────────────────────────────────────────

export class AutomationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class ElementNotFoundError extends AutomationError {
  constructor(
    message: string,
    public readonly selector: ElementSelector,
    public readonly windowHandle: string,
    public readonly lastSnapshot?: ElementNode[],
  ) {
    super(message);
  }
}

export class WindowNotFoundError extends AutomationError {
  constructor(
    message: string,
    public readonly processId: number,
    public readonly timeoutMs: number,
    public readonly processImage?: string,
  ) {
    super(message);
  }
}

export class StaleElementError extends AutomationError {
  constructor(
    message: string,
    public readonly oldHandle: string,
    public readonly newHandle?: string,
    public readonly selector?: ElementSelector,
  ) {
    super(message);
  }
}

export class PermissionDeniedError extends AutomationError {
  constructor(
    message: string,
    public readonly handle: string,
    public readonly isUipibarrier: boolean = false,
  ) {
    super(message);
  }
}

export class TimeoutError extends AutomationError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
  }
}

export class BackendError extends AutomationError {
  constructor(
    message: string,
    public readonly backendName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class PatternNotSupportedError extends AutomationError {
  constructor(
    message: string,
    public readonly handle: string,
    public readonly patternName: string,
  ) {
    super(message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

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

function flattenTree(
  nodes: ElementNode[],
  depth: number,
  maxDepth: number,
  indent: string,
): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    const attrs = [
      node.name ? `"${node.name}"` : "",
      node.role || "",
      node.automationId ? `#${node.automationId}` : "",
    ]
      .filter(Boolean)
      .join(" ");
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
): Promise<ElementNotFoundError> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const selectorStr = formatSelector(selector);

  let treeMsg = "";
  let snapshot: ElementNode[] | undefined;
  try {
    const tree = await backend.inspectWindowTree(windowHandle, MAX_TREE_DEPTH);
    if (tree.length > 0) {
      snapshot = tree;
      treeMsg = `\nAvailable elements in window:\n${formatTree(tree)}`;
    }
  } catch {
    treeMsg = "\n(Could not inspect window tree)";
  }

  const message =
    `Element not found after ${timeoutMs}ms\n` +
    `  Selector: { ${selectorStr} }\n` +
    `  Window handle: ${windowHandle}${treeMsg}`;

  return new ElementNotFoundError(message, selector, windowHandle, snapshot);
}

export async function buildWindowNotFoundError(
  processId: number,
  timeoutMs: number,
  backend: Backend,
): Promise<WindowNotFoundError> {
  let processesMsg = "";
  let imageName: string | undefined;
  try {
    imageName = backend.getProcessImageName(processId);
    if (imageName) {
      processesMsg = `\n  Process image: ${imageName}`;
    }
  } catch {
    // ignore
  }

  const message =
    `No top-level window found for process ${processId} within ${timeoutMs}ms.` +
    processesMsg +
    `\n  Verify the process is running and has a visible window.`;

  return new WindowNotFoundError(message, processId, timeoutMs, imageName);
}

/** Check if an error is likely a stale-element or element-not-found condition
 *  that can be recovered by re-resolving the element's selector.
 *  Non-retriable errors (PermissionDeniedError, TimeoutError, PatternNotSupportedError)
 *  propagate immediately instead of triggering a useless retry cycle. */
export function isStaleError(err: unknown): boolean {
  return (
    err instanceof ElementNotFoundError ||
    err instanceof StaleElementError ||
    err instanceof BackendError
  );
}

export { formatSelector };
