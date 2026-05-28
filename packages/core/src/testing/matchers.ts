import { expect } from "vitest";
import type { Element } from "../api/element";

interface ElementAssertions {
  toBeVisible: () => Promise<void>;
  toBeEnabled: () => Promise<void>;
  toHaveFocus: () => Promise<void>;
  toExist: () => Promise<void>;
  toHaveText: (expected: string | RegExp) => Promise<void>;
  toHaveValue: (expected: string | RegExp) => Promise<void>;
}

export function expectElement(el: Element): ElementAssertions {
  return {
    async toBeVisible(): Promise<void> {
      const visible = await el.isVisible();
      expect(visible, `Expected element ${el.handle} to be visible`).toBe(true);
    },
    async toBeEnabled(): Promise<void> {
      const enabled = await el.isEnabled();
      expect(enabled, `Expected element ${el.handle} to be enabled`).toBe(true);
    },
    async toHaveFocus(): Promise<void> {
      const focused = await el.isFocused();
      expect(focused, `Expected element ${el.handle} to have focus`).toBe(true);
    },
    async toExist(): Promise<void> {
      const exists = await el.exists();
      expect(exists, `Expected element ${el.handle} to exist`).toBe(true);
    },
    async toHaveText(expected: string | RegExp): Promise<void> {
      const text = await el.getText();
      if (expected instanceof RegExp) {
        expect(text, `Expected element ${el.handle} text to match ${expected}`).toMatch(expected);
      } else {
        expect(text, `Expected element ${el.handle} text to be "${expected}"`).toBe(expected);
      }
    },
    async toHaveValue(expected: string | RegExp): Promise<void> {
      const value = await el.getValue();
      if (expected instanceof RegExp) {
        expect(value, `Expected element ${el.handle} value to match ${expected}`).toMatch(expected);
      } else {
        expect(value, `Expected element ${el.handle} value to be "${expected}"`).toBe(expected);
      }
    },
  };
}

export function toBeBMP(buffer: Uint8Array | number[]): boolean {
  return buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d;
}

export function expectScreenshot(buffer: Uint8Array | number[]): { toBeBMP: () => void } {
  return {
    toBeBMP(): void {
      expect(toBeBMP(buffer), "Expected buffer to be a valid BMP image").toBe(true);
    },
  };
}
