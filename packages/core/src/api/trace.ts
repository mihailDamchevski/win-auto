import type { AutomationEvents } from "./events";
import type { ElementSelector, InputMode } from "./types";

export type TraceEventType =
  | "action:click"
  | "action:rightClick"
  | "action:doubleClick"
  | "action:hover"
  | "action:type"
  | "action:select"
  | "action:toggle"
  | "action:setValue"
  | "action:focus"
  | "action:clear"
  | "action:scroll"
  | "action:dragDrop"
  | "action:mouseMove"
  | "action:launchApp"
  | "action:connectApp"
  | "window:close"
  | "window:maximize"
  | "window:minimize"
  | "window:restore"
  | "locator:found"
  | "locator:staleRecovered"
  | "locator:decision"
  | "inputMode:decision"
  | "snapshot:before"
  | "snapshot:after"
  | "screenshot"
  | "error"
  | "assertion"
  | "app:launched"
  | "app:closed"
  | "window:found"
  | "winEvent";

export type TraceEntry = {
  timestamp: number;
  type: TraceEventType;
  durationMs?: number;
  selector?: ElementSelector;
  inputMode?: InputMode;
  elementHandle?: string;
  windowHandle?: string;
  text?: string;
  processId?: number;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  expected?: unknown;
  actual?: unknown;
  assertionMessage?: string;
  decision?: {
    strategyName: string;
    confidence: number;
    reason: string;
    candidates: number;
  };
};

export type TraceTimingCategory = {
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
};

export type TraceSession = {
  startTime: number;
  endTime?: number;
  entryCount: number;
  entries: TraceEntry[];
  errors?: Array<{
    timestamp: number;
    name: string;
    message: string;
    stack?: string;
  }>;
  assertionFailures?: Array<{
    timestamp: number;
    expected: unknown;
    actual: unknown;
    message: string;
  }>;
  locatorDecisions?: TraceEntry[];
  timingBreakdown?: Record<string, TraceTimingCategory>;
};

const EVENT_TRACE_MAP: Record<string, TraceEventType> = {
  "element:clicked": "action:click",
  "element:rightClicked": "action:rightClick",
  "element:doubleClicked": "action:doubleClick",
  "element:hovered": "action:hover",
  "element:typed": "action:type",
  "element:selected": "action:select",
  "element:toggled": "action:toggle",
  "element:valueChanged": "action:setValue",
  "mouse:moved": "action:mouseMove",
  "element:found": "locator:found",
  "element:staleRecovered": "locator:staleRecovered",
  "element:screenshot": "screenshot",
  "app:launched": "app:launched",
  "app:closed": "app:closed",
  "window:found": "window:found",
  "window:closed": "window:close",
  "window:maximized": "window:maximize",
  "window:minimized": "window:minimize",
  "window:restored": "window:restore",
};

let currentTraceRecorder: TraceRecorder | undefined;

export function setCurrentTraceRecorder(recorder?: TraceRecorder): void {
  currentTraceRecorder = recorder;
}

export function getCurrentTraceRecorder(): TraceRecorder | undefined {
  return currentTraceRecorder;
}

export class TraceRecorder {
  public readonly entries: TraceEntry[] = [];
  public readonly startTime: number = Date.now();
  private events?: AutomationEvents;
  private listeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  attach(ev: AutomationEvents): void {
    this.events = ev;
    for (const [eventName, traceType] of Object.entries(EVENT_TRACE_MAP)) {
      const handler = (payload: Record<string, unknown>) => {
        this.entries.push(this.payloadToEntry(traceType, payload));
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ev.on(eventName as any, handler as any);
      this.listeners.push({ event: eventName, handler: handler as (...args: unknown[]) => void });
    }
  }

  detach(): void {
    if (!this.events) return;
    for (const { event, handler } of this.listeners) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.events.off(event as any, handler as any);
    }
    this.listeners = [];
    this.events = undefined;
  }

  recordEntry(type: TraceEventType, details?: Omit<TraceEntry, "type" | "timestamp">): void {
    this.entries.push({ timestamp: Date.now(), type, ...details });
  }

  recordError(error: Error, context?: Record<string, unknown>): void {
    this.entries.push({
      timestamp: Date.now(),
      type: "error",
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      metadata: context,
    });
  }

  recordAssertionFailure(
    expected: unknown,
    actual: unknown,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.entries.push({
      timestamp: Date.now(),
      type: "assertion",
      expected,
      actual,
      assertionMessage: message,
      metadata: context,
    });
  }

  recordLocatorDecision(
    selector: ElementSelector,
    candidates: number,
    strategyName: string,
    confidence: number,
    reason: string,
  ): void {
    this.entries.push({
      timestamp: Date.now(),
      type: "locator:decision",
      selector,
      decision: { strategyName, confidence, reason, candidates },
    });
  }

  recordInputModeDecision(
    target: string,
    chosen: InputMode,
    reason: string,
  ): void {
    this.entries.push({
      timestamp: Date.now(),
      type: "inputMode:decision",
      inputMode: chosen,
      text: target,
      metadata: { reason },
    });
  }

  clear(): void {
    this.entries.length = 0;
  }

  getTimingBreakdown(): Record<string, TraceTimingCategory> {
    const buckets = new Map<string, number[]>();
    for (const entry of this.entries) {
      if (entry.durationMs === undefined) continue;
      const cat = entry.type.split(":")[0] ?? "other";
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(entry.durationMs);
    }
    const result: Record<string, TraceTimingCategory> = {};
    for (const [cat, durations] of buckets) {
      const sorted = [...durations].sort((a, b) => a - b);
      const totalMs = durations.reduce((s, d) => s + d, 0);
      result[cat] = {
        count: durations.length,
        totalMs: Math.round(totalMs * 100) / 100,
        avgMs: Math.round((totalMs / durations.length) * 100) / 100,
        minMs: sorted[0] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
      };
    }
    return result;
  }

  export(): TraceSession {
    const timingBreakdown = this.getTimingBreakdown();
    const errors = this.entries
      .filter((e) => e.type === "error" && e.error)
      .map((e) => ({
        timestamp: e.timestamp,
        name: e.error!.name,
        message: e.error!.message,
        stack: e.error!.stack,
      }));
    const assertionFailures = this.entries
      .filter((e) => e.type === "assertion")
      .map((e) => ({
        timestamp: e.timestamp,
        expected: e.expected,
        actual: e.actual,
        message: e.assertionMessage ?? "",
      }));
    const locatorDecisions = this.entries.filter(
      (e) => e.type === "locator:decision",
    );

    const session: TraceSession = {
      startTime: this.startTime,
      endTime: Date.now(),
      entryCount: this.entries.length,
      entries: [...this.entries],
    };

    if (errors.length > 0) session.errors = errors;
    if (assertionFailures.length > 0) session.assertionFailures = assertionFailures;
    if (locatorDecisions.length > 0) session.locatorDecisions = locatorDecisions;
    if (Object.keys(timingBreakdown).length > 0) session.timingBreakdown = timingBreakdown;

    return session;
  }

  private payloadToEntry(type: TraceEventType, payload: Record<string, unknown>): TraceEntry {
    const entry: TraceEntry = {
      timestamp: (payload.timestamp as number) ?? Date.now(),
      type,
    };
    if (payload.handle) entry.elementHandle = payload.handle as string;
    if (payload.windowHandle) entry.windowHandle = payload.windowHandle as string;
    if (payload.text) entry.text = payload.text as string;
    if (payload.processId) entry.processId = payload.processId as number;
    if (payload.selector) entry.selector = payload.selector as ElementSelector;
    if (payload.x !== undefined && payload.y !== undefined) {
      entry.metadata = { x: payload.x, y: payload.y };
    }
    if (payload.retryCount !== undefined) {
      entry.metadata = { ...entry.metadata, retryCount: payload.retryCount };
    }
    return entry;
  }
}
