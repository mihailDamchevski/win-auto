import type { Backend } from "./backend";
import { TimeoutError } from "./errors";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MS = 100;
const ADAPTIVE_MIN_MS = 10;
const ADAPTIVE_MAX_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Condition runner ──────────────────────────────────────────────────

export type PollOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  adaptive?: boolean;
};

/** Poll a condition function until it returns a non-null/non-undefined value
 *  that satisfies the optional predicate. Uses waitForUiChange when a backend
 *  is available, otherwise falls back to setTimeout. */
export async function pollCondition<T>(
  fn: () => Promise<T | null | undefined>,
  backend?: Backend,
  options?: PollOptions,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();
  let interval = options?.adaptive ? ADAPTIVE_MIN_MS : (options?.intervalMs ?? DEFAULT_INTERVAL_MS);

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      throw new TimeoutError(
        `Condition not satisfied within ${timeoutMs}ms`,
        "pollCondition",
        timeoutMs,
      );
    }

    const result = await fn();
    if (result !== null && result !== undefined) {
      return result;
    }

    const waitMs = Math.min(interval, timeoutMs - elapsed);
    if (backend) {
      await backend.waitForUiChange(waitMs);
    } else {
      await delay(waitMs);
    }

    if (options?.adaptive) {
      interval = Math.min(interval * 2, ADAPTIVE_MAX_MS);
    }
  }
}

// ─── WaitCondition<T> — generic fluent wait ────────────────────────────

export class WaitCondition<T> {
  protected backend: Backend | undefined;
  protected condition: () => Promise<T | null | undefined>;
  protected predicate: (value: T) => boolean = () => true;
  protected timeoutMs = DEFAULT_TIMEOUT_MS;
  protected intervalMs = DEFAULT_INTERVAL_MS;
  protected useAdaptive = false;
  protected compoundChecks: Array<() => Promise<boolean>> = [];
  protected compoundMode: "and" | "or" = "and";

  constructor(condition: () => Promise<T | null | undefined>, backend?: Backend) {
    this.condition = condition;
    this.backend = backend;
  }

  matches(predicate: (value: T) => boolean): this {
    this.predicate = predicate;
    return this;
  }

  equals(expected: T): this {
    this.predicate = (value) => value === expected;
    return this;
  }

  for(timeoutMs: number): this {
    this.timeoutMs = timeoutMs;
    return this;
  }

  polling(intervalMs: number): this {
    this.intervalMs = intervalMs;
    this.useAdaptive = false;
    return this;
  }

  adaptive(): this {
    this.useAdaptive = true;
    return this;
  }

  and(check: () => Promise<boolean>): this {
    this.compoundChecks.push(check);
    this.compoundMode = "and";
    return this;
  }

  or(check: () => Promise<boolean>): this {
    this.compoundChecks.push(check);
    this.compoundMode = "or";
    return this;
  }

  async wait(): Promise<T> {
    return pollCondition(
      async () => {
        const value = await this.condition();
        if (value === null || value === undefined) return null;
        if (!this.predicate(value)) return null;

        if (this.compoundChecks.length > 0) {
          if (this.compoundMode === "and") {
            for (const check of this.compoundChecks) {
              if (!(await check())) return null;
            }
          } else {
            let anyOk = false;
            for (const check of this.compoundChecks) {
              if (await check()) { anyOk = true; break; }
            }
            if (!anyOk) return null;
          }
        }

        return value;
      },
      this.backend,
      { timeoutMs: this.timeoutMs, intervalMs: this.intervalMs, adaptive: this.useAdaptive },
    );
  }
}

// ─── ElementWait — fluent wait for Element ─────────────────────────────

import { Element } from "./element";

export class ElementWait extends WaitCondition<Element> {
  private element: Element;

  constructor(element: Element) {
    super(async () => element, element.backend);
    this.element = element;
  }

  isVisible(): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => (await el.isVisible()) ? el : null;
    return this;
  }

  isEnabled(): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => (await el.isEnabled()) ? el : null;
    return this;
  }

  hasText(text: string): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => {
      const t = await el.getText();
      return t.includes(text) ? el : null;
    };
    return this;
  }

  matchesText(pattern: RegExp): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => {
      const t = await el.getText();
      return pattern.test(t) ? el : null;
    };
    return this;
  }

  notVisible(): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => (await el.isVisible()) ? null : el;
    return this;
  }

  notEnabled(): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => (await el.isEnabled()) ? null : el;
    return this;
  }

  removed(): this {
    const el = this.element;
    this.condition = async (): Promise<Element | null> => {
      const exists = await el.exists();
      return exists ? null : el;
    };
    return this;
  }

  async exists(): Promise<boolean> {
    try {
      await pollCondition(
        async () => {
          const v = await this.condition();
          return this.predicate(v as Element) ? v : null;
        },
        this.backend,
        { timeoutMs: this.timeoutMs, intervalMs: this.intervalMs, adaptive: this.useAdaptive },
      );
      return true;
    } catch {
      return false;
    }
  }
}

// ─── WindowWait — fluent wait for Window ───────────────────────────────

import { Window } from "./window";

export class WindowWait extends WaitCondition<Window> {
  private win: Window;

  constructor(win: Window) {
    super(async () => win, win.backend);
    this.win = win;
  }

  isVisible(): this {
    const w = this.win;
    this.condition = async (): Promise<Window | null> => {
      const bounds = await w.getBounds();
      return (bounds.width > 0 && bounds.height > 0) ? w : null;
    };
    return this;
  }

  closed(): this {
    const w = this.win;
    const handle = w.handle;
    const backend = w.backend;
    this.condition = async (): Promise<Window | null> => {
      const windows = await backend.enumerateWindows(0);
      const exists = windows.some((wh) => wh === handle);
      return exists ? null : w;
    };
    return this;
  }
}

// ─── Wait factory ──────────────────────────────────────────────────────

export class WaitBuilder {
  constructor(private backend?: Backend) {}

  using(backend: Backend): this {
    this.backend = backend;
    return this;
  }

  until<T>(fn: () => Promise<T | null | undefined>, backend?: Backend): WaitCondition<T>;
  until(element: Element): ElementWait;
  until(win: Window): WindowWait;
  until<T>(
    arg: (() => Promise<T | null | undefined>) | Element | Window,
    backend?: Backend,
  ): WaitCondition<T> | ElementWait | WindowWait {
    if (arg instanceof Element) {
      return new ElementWait(arg);
    }
    if (arg instanceof Window) {
      return new WindowWait(arg);
    }
    return new WaitCondition<T>(arg as () => Promise<T | null | undefined>, backend ?? this.backend);
  }
}

/** Global wait builder. For function-based conditions without a captured
 *  backend, use `.using(backend)` or go through `automation.wait`. */
export const wait = new WaitBuilder();
