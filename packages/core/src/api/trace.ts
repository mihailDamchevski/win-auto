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
  | "screenshot"
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
};

export type TraceSession = {
  startTime: number;
  endTime?: number;
  entryCount: number;
  entries: TraceEntry[];
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

  export(): TraceSession {
    return {
      startTime: this.startTime,
      endTime: Date.now(),
      entryCount: this.entries.length,
      entries: [...this.entries],
    };
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
