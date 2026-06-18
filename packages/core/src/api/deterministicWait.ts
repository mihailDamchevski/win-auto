import { TimeoutError } from "./errors";

// ─── Clock interface ───────────────────────────────────────────────────

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  advance(ms: number): void;
}

// ─── MockClock — virtual time with synchronous advancement ────────────

export class MockClock implements Clock {
  private _now = 0;
  private nextId = 1;
  private timers: Array<{ id: number; fireAt: number; fn: () => void }> = [];
  private running = false;

  now(): number {
    return this._now;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, fireAt: this._now + ms, fn });
    this.timers.sort((a, b) => a.fireAt - b.fireAt);
    return id;
  }

  clearTimeout(id: number): void {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  /** Advance the clock synchronously, firing all expired timers in order. */
  advance(ms: number): void {
    if (ms < 0) return;
    const target = this._now + ms;
    while (this.timers.length > 0 && this.timers[0].fireAt <= target) {
      const timer = this.timers.shift()!;
      this._now = timer.fireAt;
      this.running = true;
      timer.fn();
      this.running = false;
    }
    this._now = target;
  }

  /** Return total pending timer count (useful for assertions). */
  pendingTimerCount(): number {
    return this.timers.length;
  }

  /** Clear all pending timers. */
  clearAll(): void {
    this.timers = [];
  }

  /** Whether a callback is currently executing. */
  isRunning(): boolean {
    return this.running;
  }
}

// ─── DeterministicPoll — async polling with virtual time ───────────────

export interface PollFn<T> {
  (): Promise<T | null | undefined>;
}

export class DeterministicPoll {
  constructor(private clock: MockClock) {}

  /**
   * Polls `fn` using the virtual clock. Each iteration advances time by
   * `intervalMs` (or less if it would exceed the timeout), processing any
   * scheduled timers in between.
   */
  async pollCondition<T>(
    fn: PollFn<T>,
    options?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const start = this.clock.now();

    while (true) {
      const elapsed = this.clock.now() - start;
      if (elapsed >= timeoutMs) {
        throw new TimeoutError(
          `Condition not satisfied within ${timeoutMs}ms`,
          "DeterministicPoll",
          timeoutMs,
        );
      }

      const result = await fn();
      if (result !== null && result !== undefined) {
        return result;
      }

      const waitMs = Math.min(intervalMs, timeoutMs - elapsed);
      this.clock.advance(waitMs);
    }
  }
}

// ─── Convenience: deterministic pollCondition that hooks into a Backend ─
// When a Backend is provided, uses backend.waitForUiChange for inter-poll
// waits but with the virtual clock driving time advancement.

import type { Backend } from "./backend";

export class DeterministicBackendPoller {
  constructor(
    private clock: MockClock,
    private backend: Backend,
  ) {}

  getClock(): MockClock {
    return this.clock;
  }

  /**
   * Poll `fn` using the virtual clock. Each iteration calls
   * `backend.waitForUiChange(waitMs)` for the inter-poll delay,
   * but the clock advances virtually so timeouts use virtual time.
   */
  async pollCondition<T>(
    fn: PollFn<T>,
    options?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const start = this.clock.now();

    while (true) {
      const elapsed = this.clock.now() - start;
      if (elapsed >= timeoutMs) {
        throw new TimeoutError(
          `Condition not satisfied within ${timeoutMs}ms`,
          "DeterministicBackendPoller",
          timeoutMs,
        );
      }

      const result = await fn();
      if (result !== null && result !== undefined) {
        return result;
      }

      const waitMs = Math.min(intervalMs, timeoutMs - elapsed);
      // Advance the virtual clock, then let the backend process UI changes
      this.clock.advance(waitMs);
      await this.backend.waitForUiChange(waitMs);
    }
  }
}
