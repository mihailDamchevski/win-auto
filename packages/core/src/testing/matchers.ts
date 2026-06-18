import { expect } from "vitest";
import type { Element } from "../api/element";
import type { Window } from "../api/window";
import type { Dialog } from "../api/dialog";
import type { ElementSelector, WindowBounds } from "../api/types";

const DEFAULT_POLL_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 100;

async function pollFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
): Promise<T> {
  const start = Date.now();
  while (true) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() - start >= timeoutMs) {
      return value;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ─── Element Assertions (8.1, 8.2, 8.3, 8.4) ─────────────────────────

export class ElementAssertionsImpl {
  constructor(
    protected readonly el: Element,
    protected readonly negate: boolean = false,
  ) {}

  get not(): ElementAssertionsImpl {
    return new ElementAssertionsImpl(this.el, !this.negate);
  }

  async toBeVisible(): Promise<void> {
    const visible = await this.el.isVisible();
    if (this.negate) {
      expect(visible, `Expected element ${this.el.handle} to NOT be visible`).toBe(false);
    } else {
      expect(visible, `Expected element ${this.el.handle} to be visible`).toBe(true);
    }
  }

  async toBeHidden(): Promise<void> {
    const visible = await this.el.isVisible();
    expect(visible, `Expected element ${this.el.handle} to be hidden`).toBe(false);
  }

  async toBeEnabled(): Promise<void> {
    const enabled = await this.el.isEnabled();
    if (this.negate) {
      expect(enabled, `Expected element ${this.el.handle} to NOT be enabled`).toBe(false);
    } else {
      expect(enabled, `Expected element ${this.el.handle} to be enabled`).toBe(true);
    }
  }

  async toBeDisabled(): Promise<void> {
    const enabled = await this.el.isEnabled();
    expect(enabled, `Expected element ${this.el.handle} to be disabled`).toBe(false);
  }

  async toHaveFocus(): Promise<void> {
    const focused = await this.el.isFocused();
    if (this.negate) {
      expect(focused, `Expected element ${this.el.handle} to NOT have focus`).toBe(false);
    } else {
      expect(focused, `Expected element ${this.el.handle} to have focus`).toBe(true);
    }
  }

  async toExist(): Promise<void> {
    const exists = await this.el.exists();
    if (this.negate) {
      expect(exists, `Expected element ${this.el.handle} to NOT exist`).toBe(false);
    } else {
      expect(exists, `Expected element ${this.el.handle} to exist`).toBe(true);
    }
  }

  async toHaveText(expected: string | RegExp): Promise<void> {
    const text = await this.el.getText();
    if (this.negate) {
      if (expected instanceof RegExp) {
        expect(text, `Expected element ${this.el.handle} text to NOT match ${expected}`).not.toMatch(expected);
      } else {
        expect(text, `Expected element ${this.el.handle} text to NOT be "${expected}"`).not.toBe(expected);
      }
    } else {
      if (expected instanceof RegExp) {
        expect(text, `Expected element ${this.el.handle} text to match ${expected}`).toMatch(expected);
      } else {
        expect(text, `Expected element ${this.el.handle} text to be "${expected}"`).toBe(expected);
      }
    }
  }

  async toHaveValue(expected: string | RegExp): Promise<void> {
    const value = await this.el.getValue();
    if (this.negate) {
      if (expected instanceof RegExp) {
        expect(value, `Expected element ${this.el.handle} value to NOT match ${expected}`).not.toMatch(expected);
      } else {
        expect(value, `Expected element ${this.el.handle} value to NOT be "${expected}"`).not.toBe(expected);
      }
    } else {
      if (expected instanceof RegExp) {
        expect(value, `Expected element ${this.el.handle} value to match ${expected}`).toMatch(expected);
      } else {
        expect(value, `Expected element ${this.el.handle} value to be "${expected}"`).toBe(expected);
      }
    }
  }

  // 8.2 — Polling assertions

  async toEventuallyBeVisible(options?: { timeoutMs?: number; intervalMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const visible = await pollFor(
      () => this.el.isVisible(),
      (v) => v,
      timeoutMs,
      intervalMs,
    );
    expect(visible, `Expected element ${this.el.handle} to eventually be visible (${timeoutMs}ms)`).toBe(true);
  }

  async toEventuallyHaveText(expected: string | RegExp, options?: { timeoutMs?: number; intervalMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const text = await pollFor(
      () => this.el.getText(),
      (t) => expected instanceof RegExp ? expected.test(t) : t === expected,
      timeoutMs,
      intervalMs,
    );
    if (expected instanceof RegExp) {
      expect(text, `Expected element ${this.el.handle} text to eventually match ${expected} (${timeoutMs}ms)`).toMatch(expected);
    } else {
      expect(text, `Expected element ${this.el.handle} text to eventually be "${expected}" (${timeoutMs}ms)`).toBe(expected);
    }
  }

  async toEventuallyBeEnabled(options?: { timeoutMs?: number; intervalMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const enabled = await pollFor(
      () => this.el.isEnabled(),
      (e) => e,
      timeoutMs,
      intervalMs,
    );
    expect(enabled, `Expected element ${this.el.handle} to eventually be enabled (${timeoutMs}ms)`).toBe(true);
  }

  // 8.3 — State assertions

  async toBeChecked(): Promise<void> {
    const state = await this.el.getToggleState();
    expect(state, `Expected element ${this.el.handle} to be checked`).toBe("On");
  }

  async toBeUnchecked(): Promise<void> {
    const state = await this.el.getToggleState();
    expect(state, `Expected element ${this.el.handle} to be unchecked`).toBe("Off");
  }

  async toBeSelected(): Promise<void> {
    const selected = await this.el["backend"].selectionItemIsSelected(this.el.handle);
    expect(selected, `Expected element ${this.el.handle} to be selected`).toBe(true);
  }

  async toHaveAttribute(name: string, value: string | RegExp): Promise<void> {
    const actual = await this.el.getAttribute(name);
    if (value instanceof RegExp) {
      expect(actual, `Expected element ${this.el.handle} attribute "${name}" to match ${value}`).toMatch(value);
    } else {
      expect(actual, `Expected element ${this.el.handle} attribute "${name}" to be "${value}"`).toBe(value);
    }
  }

  async toHaveClassName(className: string | RegExp): Promise<void> {
    const actual = await this.el.getClassName();
    if (className instanceof RegExp) {
      expect(actual, `Expected element ${this.el.handle} className to match ${className}`).toMatch(className);
    } else {
      expect(actual, `Expected element ${this.el.handle} className to be "${className}"`).toBe(className);
    }
  }

  async toMatchSelector(selector: ElementSelector): Promise<void> {
    if (selector.automationId != null) {
      const actual = await this.el.getAttribute("automationId");
      expect(actual, `Expected element ${this.el.handle} automationId to be "${selector.automationId}"`).toBe(selector.automationId);
    }
    if (selector.name != null) {
      const actual = await this.el.getAttribute("name");
      expect(actual, `Expected element ${this.el.handle} name to be "${selector.name}"`).toBe(selector.name);
    }
    if (selector.role != null) {
      const actual = await this.el.getAttribute("role");
      expect(actual, `Expected element ${this.el.handle} role to be "${selector.role}"`).toBe(selector.role);
    }
    if (selector.className != null) {
      const actual = await this.el.getClassName();
      expect(actual, `Expected element ${this.el.handle} className to be "${selector.className}"`).toBe(selector.className);
    }
  }

  // 8.4 — Compound matcher

  async toMatch(options: {
    visible?: boolean;
    enabled?: boolean;
    text?: string | RegExp;
    role?: string;
    hasFocus?: boolean;
  }): Promise<void> {
    if (options.visible !== undefined) {
      const visible = await this.el.isVisible();
      expect(visible, `Expected element ${this.el.handle} visible=${options.visible}`).toBe(options.visible);
    }
    if (options.enabled !== undefined) {
      const enabled = await this.el.isEnabled();
      expect(enabled, `Expected element ${this.el.handle} enabled=${options.enabled}`).toBe(options.enabled);
    }
    if (options.text !== undefined) {
      const text = await this.el.getText();
      if (options.text instanceof RegExp) {
        expect(text, `Expected element ${this.el.handle} text to match ${options.text}`).toMatch(options.text);
      } else {
        expect(text, `Expected element ${this.el.handle} text to be "${options.text}"`).toBe(options.text);
      }
    }
    if (options.role !== undefined) {
      const role = await this.el.getAttribute("role");
      expect(role, `Expected element ${this.el.handle} role to be "${options.role}"`).toBe(options.role);
    }
    if (options.hasFocus !== undefined) {
      const focused = await this.el.isFocused();
      expect(focused, `Expected element ${this.el.handle} hasFocus=${options.hasFocus}`).toBe(options.hasFocus);
    }
  }
}

export function expectElement(el: Element): ElementAssertionsImpl {
  return new ElementAssertionsImpl(el);
}

// ─── Screenshot matchers ──────────────────────────────────────────────

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

// ─── Window Assertions (8.5) ──────────────────────────────────────────

function getMockBackend(backend: unknown) {
  const mock = backend as { getWindowRecord?: (handle: string) => { title: string; isMaximized: boolean; isMinimized: boolean; isFocused: boolean } | undefined };
  return mock.getWindowRecord;
}

export class WindowAssertionsImpl {
  constructor(
    protected readonly win: Window,
    protected readonly negate: boolean = false,
  ) {}

  get not(): WindowAssertionsImpl {
    return new WindowAssertionsImpl(this.win, !this.negate);
  }

  async toBeVisible(): Promise<void> {
    const bounds = await this.win.getBounds();
    const visible = bounds.width > 0 && bounds.height > 0;
    if (this.negate) {
      expect(visible, `Expected window ${this.win.handle} to NOT be visible`).toBe(false);
    } else {
      expect(visible, `Expected window ${this.win.handle} to be visible`).toBe(true);
    }
  }

  async toHaveTitle(expected: string | RegExp): Promise<void> {
    const getRecord = getMockBackend(this.win.backend);
    const record = getRecord?.(this.win.handle);
    const title = record?.title ?? "";
    if (expected instanceof RegExp) {
      if (this.negate) {
        expect(title, `Expected window ${this.win.handle} title to NOT match ${expected}`).not.toMatch(expected);
      } else {
        expect(title, `Expected window ${this.win.handle} title to match ${expected}`).toMatch(expected);
      }
    } else if (this.negate) {
      expect(title, `Expected window ${this.win.handle} title to NOT be "${expected}"`).not.toBe(expected);
    } else {
      expect(title, `Expected window ${this.win.handle} title to be "${expected}"`).toBe(expected);
    }
  }

  async toHaveBounds(expected: WindowBounds): Promise<void> {
    const actual = await this.win.getBounds();
    if (this.negate) {
      const match = actual.left === expected.left && actual.top === expected.top
        && actual.width === expected.width && actual.height === expected.height;
      expect(match, `Expected window ${this.win.handle} bounds to NOT match`).toBe(false);
    } else {
      expect(actual.left, `Expected window ${this.win.handle} left`).toBe(expected.left);
      expect(actual.top, `Expected window ${this.win.handle} top`).toBe(expected.top);
      expect(actual.width, `Expected window ${this.win.handle} width`).toBe(expected.width);
      expect(actual.height, `Expected window ${this.win.handle} height`).toBe(expected.height);
    }
  }

  async toBeMaximized(): Promise<void> {
    const getRecord = getMockBackend(this.win.backend);
    const record = getRecord?.(this.win.handle);
    const maximized = record?.isMaximized ?? false;
    if (this.negate) {
      expect(maximized, `Expected window ${this.win.handle} to NOT be maximized`).toBe(false);
    } else {
      expect(maximized, `Expected window ${this.win.handle} to be maximized`).toBe(true);
    }
  }

  async toBeMinimized(): Promise<void> {
    const getRecord = getMockBackend(this.win.backend);
    const record = getRecord?.(this.win.handle);
    const minimized = record?.isMinimized ?? false;
    if (this.negate) {
      expect(minimized, `Expected window ${this.win.handle} to NOT be minimized`).toBe(false);
    } else {
      expect(minimized, `Expected window ${this.win.handle} to be minimized`).toBe(true);
    }
  }

  async toHaveFocus(): Promise<void> {
    const getRecord = getMockBackend(this.win.backend);
    const record = getRecord?.(this.win.handle);
    const focused = record?.isFocused ?? false;
    if (this.negate) {
      expect(focused, `Expected window ${this.win.handle} to NOT have focus`).toBe(false);
    } else {
      expect(focused, `Expected window ${this.win.handle} to have focus`).toBe(true);
    }
  }
}

export function expectWindow(win: Window): WindowAssertionsImpl {
  return new WindowAssertionsImpl(win);
}

// ─── Dialog Assertions (8.5) ──────────────────────────────────────────

export class DialogAssertionsImpl {
  constructor(
    protected readonly dialog: Dialog,
    protected readonly negate: boolean = false,
  ) {}

  get not(): DialogAssertionsImpl {
    return new DialogAssertionsImpl(this.dialog, !this.negate);
  }

  async toHaveTitle(expected: string | RegExp): Promise<void> {
    if (expected instanceof RegExp) {
      if (this.negate) {
        expect(this.dialog.title, `Expected dialog ${this.dialog.handle} title to NOT match ${expected}`).not.toMatch(expected);
      } else {
        expect(this.dialog.title, `Expected dialog ${this.dialog.handle} title to match ${expected}`).toMatch(expected);
      }
    } else if (this.negate) {
      expect(this.dialog.title, `Expected dialog ${this.dialog.handle} title to NOT be "${expected}"`).not.toBe(expected);
    } else {
      expect(this.dialog.title, `Expected dialog ${this.dialog.handle} title to be "${expected}"`).toBe(expected);
    }
  }

  async toHaveButton(buttonText: string): Promise<void> {
    const controls = await this.dialog.getControls();
    const found = controls.some((c) => c.name === buttonText);
    if (this.negate) {
      expect(found, `Expected dialog ${this.dialog.handle} to NOT have button "${buttonText}"`).toBe(false);
    } else {
      expect(found, `Expected dialog ${this.dialog.handle} to have button "${buttonText}"`).toBe(true);
    }
  }

  async toBeVisible(): Promise<void> {
    const controls = await this.dialog.getControls();
    if (this.negate) {
      expect(controls.length, `Expected dialog ${this.dialog.handle} to NOT be visible`).toBe(0);
    } else {
      expect(controls.length, `Expected dialog ${this.dialog.handle} to be visible`).toBeGreaterThan(0);
    }
  }
}

export function expectDialog(dialog: Dialog): DialogAssertionsImpl {
  return new DialogAssertionsImpl(dialog);
}
