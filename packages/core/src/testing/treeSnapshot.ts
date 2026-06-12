import { expect } from "vitest";
import type { ElementNode } from "../api/types";

function serializeNode(node: ElementNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const info = [
    node.role && `role="${node.role}"`,
    node.name && `name="${node.name}"`,
    node.automationId && `automationId="${node.automationId}"`,
    !node.isVisible && "hidden",
    !node.isEnabled && "disabled",
  ]
    .filter(Boolean)
    .join(" ");
  let result = `${indent}<${node.role || "node"} ${info}>`;
  for (const child of node.children) {
    result += "\n" + serializeNode(child, depth + 1);
  }
  return result;
}

function serializeTree(tree: ElementNode[]): string {
  return tree.map((node) => serializeNode(node)).join("\n");
}

/**
 * Assert that an element tree matches a stored snapshot.
 *
 * Usage:
 *   const tree = window.inspectTree(3);
 *   expectElementTree(tree).toMatchElementTree();
 */
export function expectElementTree(tree: ElementNode[]): {
  toMatchElementTree: () => void;
} {
  return {
    toMatchElementTree(): void {
      const serialized = serializeTree(tree);
      expect(serialized).toMatchSnapshot("element-tree");
    },
  };
}
