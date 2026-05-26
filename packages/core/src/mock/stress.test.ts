import { beforeEach, describe, expect, it } from "vitest";
import { MockBackend } from "./mockBackend";
import type { MockTreeElement } from "./mockRuntime";

describe("MockBackend stress/volume", () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend();
  });

  it("handles 100 elements in a flat tree", async () => {
    const pid = await backend.launch("C:\\stress.exe");

    const elements: MockTreeElement[] = [];
    for (let i = 0; i < 100; i++) {
      elements.push({ name: `item-${i}`, role: "listitem", automationId: `id-${i}` });
    }

    const tree: MockTreeElement = {
      name: "list",
      role: "list",
      children: elements,
    };

    const treeWinHandle = backend.setupElementTree(pid, tree, "Stress Window");

    const allElements = await backend.findAll(treeWinHandle, null, null, null, null, null, null, null);
    expect(allElements.length).toBe(101); // list + 100 items

    const items = await backend.findAll(treeWinHandle, null, null, null, "listitem", null, null, null);
    expect(items.length).toBe(100);

    const found = await backend.findElement(treeWinHandle, null, null, "item-42", "listitem");
    expect(found).not.toBeNull();
  });

  it("handles 1000 elements in a flat tree", async () => {
    const pid = await backend.launch("C:\\stress.exe");

    const elements: MockTreeElement[] = [];
    for (let i = 0; i < 1000; i++) {
      elements.push({ name: `item-${i}`, role: "listitem", automationId: `id-${i}` });
    }

    const tree: MockTreeElement = {
      name: "big-list",
      role: "list",
      children: elements,
    };

    const treeWinHandle = backend.setupElementTree(pid, tree, "Big Stress Window");

    const allElements = await backend.findAll(treeWinHandle, null, null, null, null, null, null, null);
    expect(allElements.length).toBe(1001);

    const lastItem = await backend.findElement(treeWinHandle, null, null, "item-999", "listitem");
    expect(lastItem).not.toBeNull();
  });

  it("handles 5000 elements and measures find performance", async () => {
    const pid = await backend.launch("C:\\stress.exe");

    const elements: MockTreeElement[] = [];
    for (let i = 0; i < 5000; i++) {
      elements.push({ name: `perf-item-${i}`, role: "listitem" });
    }

    const tree: MockTreeElement = {
      name: "perf-list",
      role: "list",
      children: elements,
    };

    const setupStart = performance.now();
    const treeWinHandle = backend.setupElementTree(pid, tree, "Perf Window");
    const setupTime = performance.now() - setupStart;

    expect(setupTime).toBeLessThan(2000);

    const findStart = performance.now();
    const found = await backend.findElement(treeWinHandle, null, null, "perf-item-2500", "listitem");
    const findTime = performance.now() - findStart;

    expect(found).not.toBeNull();
    expect(findTime).toBeLessThan(1000);
  });

  it("handles deeply nested trees", async () => {
    const pid = await backend.launch("C:\\stress.exe");

    function buildNestedTree(depth: number, label: string): MockTreeElement {
      return {
        name: label,
        role: "group",
        children: depth > 0 ? [buildNestedTree(depth - 1, `${label}-child`)] : [],
      };
    }

    const tree = buildNestedTree(50, "root");
    const treeWinHandle = backend.setupElementTree(pid, tree, "Deep Tree");

    const allElements = await backend.findAll(treeWinHandle, null, null, null, null, null, null, null);
    expect(allElements.length).toBe(51);

    const found = await backend.findElement(treeWinHandle, null, null, "root-child-child-child", "group");
    expect(found).not.toBeNull();
  });

  it("handles multiple windows with many elements", async () => {
    const pid = await backend.launch("C:\\stress.exe");

    const win1 = backend.addWindow(pid, "Window 1");
    const win2 = backend.addWindow(pid, "Window 2");
    const win3 = backend.addWindow(pid, "Window 3");

    for (let i = 0; i < 100; i++) {
      const tabEl = await backend.findElement(win1, null, null, null, "textbox");
      if (tabEl) {
        backend.addChildElement(tabEl, { name: `tab-${i}`, role: "tabitem" });
      }
      const fieldEl = await backend.findElement(win2, null, null, null, "textbox");
      if (fieldEl) {
        backend.addChildElement(fieldEl, { name: `field-${i}`, role: "edit" });
      }
      const btnEl = await backend.findElement(win3, null, null, null, "textbox");
      if (btnEl) {
        backend.addChildElement(btnEl, { name: `btn-${i}`, role: "button" });
      }
    }

    const allWindows = await backend.enumerateWindows(pid);
    expect(allWindows.length).toBe(4); // original + 3 added

    const win1Elements = await backend.findAll(win1, null, null, null, null, null, null, null);
    expect(win1Elements.length).toBe(1 + 100); // default + 100 tabs

    const win2Fields = await backend.findAll(win2, null, null, null, "edit", null, null, null);
    expect(win2Fields.length).toBe(100);
  });

  it("handles buttons on many dialog controls", async () => {
    const pid = await backend.launch("C:\\stress.exe");

    const buttons: MockTreeElement[] = [];
    for (let i = 0; i < 200; i++) {
      buttons.push({ name: `Button ${i}`, role: "button" });
    }

    const tree: MockTreeElement = {
      name: "dialog",
      role: "pane",
      children: [
        { name: "header", role: "text" },
        { name: "content", role: "group", children: buttons },
        { name: "footer", role: "group", children: [
          { name: "OK", role: "button" },
          { name: "Cancel", role: "button" },
        ]},
      ],
    };

    const treeWinHandle = backend.setupElementTree(pid, tree, "Dialog");

    const lastBtn = await backend.findElement(treeWinHandle, null, null, "Button 199", "button");
    expect(lastBtn).not.toBeNull();

    await backend.clickElement(lastBtn!);
    const ok = await backend.findElement(treeWinHandle, null, null, "OK", "button");
    expect(ok).not.toBeNull();
  });
});
