import blessed from "blessed";
import { NativeBackend } from "@win-auto/core";
import type { ElementNode, ElementSelector } from "@win-auto/core";

type FlatNode = {
  id: number;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  node: ElementNode;
  parentId: number | null;
  filterMatch: boolean;
};

type InspectorState = {
  pid: number;
  windowHandle: string;
  rootNodes: ElementNode[];
  flatList: FlatNode[];
  selectedIndex: number;
  filterText: string;
  treeMode: "uia" | "hwnd";
  screen: blessed.Widgets.Screen;
  treeBox: blessed.Widgets.BoxElement;
  detailBox: blessed.Widgets.BoxElement;
  filterBox: blessed.Widgets.TextboxElement;
  statusBar: blessed.Widgets.BoxElement;
  headerBar: blessed.Widgets.BoxElement;
  running: boolean;
};

function buildFlatList(
  nodes: ElementNode[],
  depth: number,
  parentId: number | null,
  filterText: string,
  startId: number,
): { flat: FlatNode[]; nextId: number } {
  const flat: FlatNode[] = [];
  let id = startId;
  for (const node of nodes) {
    const label = [node.name, node.role, node.automationId].filter(Boolean).join(" | ") || "(unnamed)";
    const filterMatch =
      !filterText ||
      label.toLowerCase().includes(filterText.toLowerCase()) ||
      node.handle.toLowerCase().includes(filterText.toLowerCase());
    const flatNode: FlatNode = {
      id,
      depth,
      expanded: depth < 2,
      hasChildren: node.children.length > 0,
      node,
      parentId,
      filterMatch,
    };
    flat.push(flatNode);
    id++;
    if (flatNode.expanded && node.children.length > 0) {
      const children = buildFlatList(node.children, depth + 1, flatNode.id, filterText, id);
      flat.push(...children.flat);
      id = children.nextId;
    }
  }
  return { flat, nextId: id };
}

function getVisibleNodes(flat: FlatNode[]): number[] {
  const visible: number[] = [];
  const collapsedStack: number[] = [];
  for (const fn of flat) {
    if (collapsedStack.length > 0) {
      const top = collapsedStack[collapsedStack.length - 1];
      const topNode = flat.find((f) => f.id === top);
      if (topNode && fn.depth <= topNode.depth) {
        collapsedStack.pop();
      }
    }
    if (collapsedStack.length === 0) {
      visible.push(fn.id);
      if (fn.hasChildren && !fn.expanded) {
        collapsedStack.push(fn.id);
      }
    }
  }
  return visible;
}

function formatHandle(h: string): string {
  return h.startsWith("0x") ? h : `0x${parseInt(h, 10).toString(16)}`;
}

function generateLocator(node: ElementNode): ElementSelector {
  const sel: ElementSelector = {};
  if (node.name) sel.name = node.name;
  if (node.role) sel.role = node.role;
  if (node.automationId) sel.automationId = node.automationId;
  return sel;
}

function formatLocator(sel: ElementSelector): string {
  const parts: string[] = [];
  if (sel.name) parts.push(`name: "${sel.name}"`);
  if (sel.role) parts.push(`role: "${sel.role}"`);
  if (sel.automationId) parts.push(`automationId: "${sel.automationId}"`);
  if (sel.className) parts.push(`className: "${sel.className}"`);
  return parts.length > 0 ? `{ ${parts.join(", ")} }` : "(no distinguishing attributes)";
}

function escapeTags(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTree(state: InspectorState): void {
  const visible = getVisibleNodes(state.flatList);
  const lines: string[] = [];
  let selectedLine = 0;

  for (let i = 0; i < visible.length; i++) {
    const fn = state.flatList.find((f) => f.id === visible[i]);
    if (!fn) continue;

    if (visible[i] === state.selectedIndex) {
      selectedLine = i;
    }

    const prefix = "  ".repeat(fn.depth);
    const icon = fn.hasChildren ? (fn.expanded ? "▼ " : "▶ ") : "  ";
    const label = [fn.node.name, fn.node.role, fn.node.automationId]
      .filter(Boolean)
      .join(" | ") || "(unnamed)";
    const disabled = !fn.node.isEnabled ? " {red-fg}[disabled]{/red-fg}" : "";
    const hidden = !fn.node.isVisible ? " {black-fg}[hidden]{/black-fg}" : "";
    const isSelected = visible[i] === state.selectedIndex;
    const marker = isSelected ? "→ " : "  ";

    const line = `${marker}${prefix}${icon}${escapeTags(label)}${disabled}${hidden}`;
    lines.push(line);
  }

  const content = lines.join("\n");
  state.treeBox.setContent(content);

  // Scroll to keep selection visible
  const box = state.treeBox as blessed.Widgets.BoxElement & { scroll?: (offset: number) => void; setScrollPerc?: (perc: number) => void };
  const visibleHeight = state.treeBox.height as number;
  const scrollPos = Math.max(0, selectedLine - Math.floor(visibleHeight / 2));
  if (typeof box.scroll === "function") {
    box.scroll(scrollPos);
  }

  state.screen.render();
}

function renderDetail(state: InspectorState): void {
  const fn = state.flatList.find((f) => f.id === state.selectedIndex);
  if (!fn) {
    state.detailBox.setContent("{bold}No element selected{/bold}");
    state.screen.render();
    return;
  }

  const n = fn.node;
  const sel = generateLocator(n);

  const props = `
{bold}── Element Details ──{/bold}

{bold}Handle:{/bold}      ${formatHandle(n.handle)}
{bold}Name:{/bold}        ${n.name || "(none)"}
{bold}Role:{/bold}        ${n.role || "(none)"}
{bold}Automation ID:{/bold}  ${n.automationId || "(none)"}
{bold}Is Visible:{/bold}   ${n.isVisible ? "{green-fg}true{/green-fg}" : "{red-fg}false{/red-fg}"}
{bold}Is Enabled:{/bold}   ${n.isEnabled ? "{green-fg}true{/green-fg}" : "{red-fg}false{/red-fg}"}
{bold}Children:{/bold}     ${n.children.length}
{bold}Depth:{/bold}        ${fn.depth}

{bold}── Locator ──{/bold}

${formatLocator(sel)}

{bold}── Actions ──{/bold}

{h} Highlight (3s)  {/h}
{r} Refresh tree
{/}

Press {bold}h{/bold} to highlight this element on screen
Press {bold}r{/bold} to refresh the UIA tree
`;

  state.detailBox.setContent(props);
  state.screen.render();
}

function refreshTree(state: InspectorState, callback?: () => void): void {
  try {
    const backend = new NativeBackend();
    const tree = backend.inspectWindowTree(state.windowHandle, 10);
    state.rootNodes = tree;
    const result = buildFlatList(tree, 0, null, state.filterText, 1);
    state.flatList = result.flat;
    state.selectedIndex = state.flatList.length > 0 ? state.flatList[0].id : -1;
    renderTree(state);
    renderDetail(state);
    if (callback) callback();
  } catch {
    state.statusBar.setContent("{red-fg}Failed to refresh tree{/red-fg}");
    state.screen.render();
    if (callback) callback();
  }
}

function highlightElement(state: InspectorState): void {
  const fn = state.flatList.find((f) => f.id === state.selectedIndex);
  if (!fn) return;

  try {
    const backend = new NativeBackend();
    backend.highlightElement(fn.node.handle, null, 3000);
    state.statusBar.setContent(
      `{green-fg}Highlighted ${formatHandle(fn.node.handle)} (3s){/green-fg}`,
    );
  } catch {
    state.statusBar.setContent("{red-fg}Highlight failed{/red-fg}");
  }
  state.screen.render();
}

export async function inspectorCommand(target: string, initialMode?: "uia" | "hwnd"): Promise<void> {
  const backend = new NativeBackend();
  const pid = Number(target);
  let targetPid: number;

  if (!Number.isNaN(pid)) {
    targetPid = pid;
  } else {
    const processes = backend.findProcessesByName(target);
    if (processes.length === 0) {
      process.stdout.write(`No processes found matching "${target}"\n`);
      return;
    }
    targetPid = processes[0].pid;
  }

  const windows = await backend.enumerateWindows(targetPid);
  if (windows.length === 0) {
    process.stdout.write(`No windows found for PID ${targetPid}\n`);
    return;
  }

  const windowHandle = windows[0];
  let elevated = false;
  try {
    elevated = backend.isProcessElevated(targetPid);
  } catch {
    // ignore
  }

  // Fetch the tree
  let rootNodes: ElementNode[];
  try {
    rootNodes = backend.inspectWindowTree(windowHandle, 10);
  } catch {
    process.stdout.write("Failed to inspect UI tree.\n");
    return;
  }

  // ── Build TUI ──
  const screen = blessed.screen({
    smartCSR: true,
    title: `win-auto inspector — PID ${targetPid}`,
    dockBorders: true,
    fullUnicode: true,
  });

  screen.key(["q", "C-c", "escape"], () => {
    process.exit(0);
  });

  // Header
  const headerBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: ` win-auto inspector — PID: ${targetPid}${elevated ? " ⚡" : ""} — ${windows.length} window(s) — ${initialMode === "hwnd" ? "HWND" : "UIA"} tree`,
    style: { bold: true, fg: "white", bg: "blue" },
    tags: true,
  });

  // Left panel: Tree
  const treeBox = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: "60%",
    bottom: 3,
    label: " Element Tree ",
    border: { type: "line" },
    style: { border: { fg: "cyan" }, focus: { border: { fg: "yellow" } } },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    scrollbar: { style: { bg: "cyan" } },
    tags: true,
    keys: true,
    vi: true,
  });

  // Right panel: Details
  const detailBox = blessed.box({
    parent: screen,
    top: 1,
    left: "60%",
    width: "40%",
    bottom: 3,
    label: " Properties ",
    border: { type: "line" },
    style: { border: { fg: "green" } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
  });

  // Filter input
  const filterBox = blessed.textbox({
    parent: screen,
    top: -1, // hidden initially
    left: 0,
    width: "100%",
    height: 1,
    inputOnFocus: true,
    style: { fg: "white", bg: "black" },
    hidden: true,
  });

  // Status bar
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    content:
      " [↑↓] Navigate  [Enter] Toggle expand  [/] Filter  [h] Highlight  [Tab] Focus  [r] Refresh  [q] Quit ",
    style: { fg: "white", bg: "black" },
    tags: true,
  });

  // Filter bar (second from bottom)
  const filterBar = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: "100%",
    height: 1,
    content: "",
    style: { fg: "yellow", bg: "black" },
    tags: true,
    hidden: true,
  });

  const state: InspectorState = {
    pid: targetPid,
    windowHandle,
    rootNodes,
    flatList: [],
    selectedIndex: -1,
    filterText: "",
    treeMode: initialMode ?? "uia",
    screen,
    treeBox,
    detailBox,
    filterBox,
    statusBar,
    headerBar,
    running: true,
  };

  // Build initial flat list
  const result = buildFlatList(rootNodes, 0, null, "", 1);
  state.flatList = result.flat;
  state.selectedIndex = state.flatList.length > 0 ? state.flatList[0].id : -1;

  renderTree(state);
  renderDetail(state);

  // ── Keybindings ──

  // Navigate tree
  screen.key(["up", "k"], () => {
    const visible = getVisibleNodes(state.flatList);
    const idx = visible.indexOf(state.selectedIndex);
    if (idx > 0) {
      state.selectedIndex = visible[idx - 1];
      renderTree(state);
      renderDetail(state);
    }
  });

  screen.key(["down", "j"], () => {
    const visible = getVisibleNodes(state.flatList);
    const idx = visible.indexOf(state.selectedIndex);
    if (idx < visible.length - 1) {
      state.selectedIndex = visible[idx + 1];
      renderTree(state);
      renderDetail(state);
    }
  });

  screen.key(["left", "h"], () => {
    const fn = state.flatList.find((f) => f.id === state.selectedIndex);
    if (fn && fn.hasChildren && fn.expanded) {
      fn.expanded = false;
      renderTree(state);
    }
  });

  screen.key(["right", "l", "enter"], () => {
    const fn = state.flatList.find((f) => f.id === state.selectedIndex);
    if (fn && fn.hasChildren) {
      fn.expanded = !fn.expanded;
      if (fn.expanded && fn.node.children.length > 0) {
        const result = buildFlatList(
          fn.node.children,
          fn.depth + 1,
          fn.id,
          state.filterText,
          fn.id + 1,
        );
        const insertIdx = state.flatList.findIndex((f) => f.id === fn.id) + 1;
        state.flatList.splice(insertIdx, 0, ...result.flat);
      }
      renderTree(state);
      renderDetail(state);
    }
  });

  // Tab between panels
  let focusPanel: "tree" | "detail" = "tree";
  screen.key(["tab"], () => {
    if (focusPanel === "tree") {
      focusPanel = "detail";
      treeBox.style.border = { fg: "cyan" };
      detailBox.style.border = { fg: "yellow" };
    } else {
      focusPanel = "tree";
      detailBox.style.border = { fg: "green" };
      treeBox.style.border = { fg: "yellow" };
    }
    state.screen.render();
  });

  // Filter
  screen.key(["/"], () => {
    filterBar.hidden = false;
    filterBar.setContent(" Filter: ");
    filterBox.top = -1; // keep hidden, use filterBar for display
    filterBox.hidden = false;
    filterBox.focus();
    filterBox.readInput((err, val) => {
      const text = (val ?? "").trim();
      filterBar.hidden = true;
      filterBox.hidden = true;
      state.filterText = text;

      // Rebuild flat list with filter
      if (text) {
        state.headerBar.setContent(
          ` win-auto inspector — PID: ${state.pid} — Filter: "${text}" `,
        );
      } else {
        state.headerBar.setContent(
          ` win-auto inspector — PID: ${state.pid}${elevated ? " ⚡" : ""} — ${windows.length} window(s) `,
        );
      }

      const result = buildFlatList(state.rootNodes, 0, null, text, 1);
      state.flatList = result.flat;
      state.selectedIndex = state.flatList.length > 0 ? state.flatList[0].id : -1;

      if (state.flatList.length === 0) {
        state.statusBar.setContent(
          "{yellow-fg}No elements match filter, showing all{/yellow-fg}",
        );
        const result2 = buildFlatList(state.rootNodes, 0, null, "", 1);
        state.flatList = result2.flat;
        state.selectedIndex = state.flatList.length > 0 ? state.flatList[0].id : -1;
      } else {
        state.statusBar.setContent(
          `{green-fg}Found ${state.flatList.filter((f) => f.filterMatch).length} matching elements{/green-fg}`,
        );
      }

      treeBox.focus();
      renderTree(state);
      renderDetail(state);
    });
    state.screen.render();
  });

  // Highlight
  screen.key(["h"], () => {
    highlightElement(state);
  });

  // Refresh
  screen.key(["r"], () => {
    state.statusBar.setContent("{cyan-fg}Refreshing tree...{/cyan-fg}");
    state.screen.render();
    refreshTree(state);
  });

  // Page up/down
  screen.key(["pageup"], () => {
    const visible = getVisibleNodes(state.flatList);
    const idx = visible.indexOf(state.selectedIndex);
    const jump = Math.max(0, idx - 10);
    state.selectedIndex = visible[jump];
    renderTree(state);
    renderDetail(state);
  });

  screen.key(["pagedown"], () => {
    const visible = getVisibleNodes(state.flatList);
    const idx = visible.indexOf(state.selectedIndex);
    const jump = Math.min(visible.length - 1, idx + 10);
    state.selectedIndex = visible[jump];
    renderTree(state);
    renderDetail(state);
  });

  // Home/End
  screen.key(["home"], () => {
    const visible = getVisibleNodes(state.flatList);
    if (visible.length > 0) {
      state.selectedIndex = visible[0];
      renderTree(state);
      renderDetail(state);
    }
  });

  screen.key(["end"], () => {
    const visible = getVisibleNodes(state.flatList);
    if (visible.length > 0) {
      state.selectedIndex = visible[visible.length - 1];
      renderTree(state);
      renderDetail(state);
    }
  });

  // Focus tree by default
  treeBox.focus();
  screen.render();
}
