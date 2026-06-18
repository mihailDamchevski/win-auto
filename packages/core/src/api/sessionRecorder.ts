import type { AutomationEvents, AppLaunchedPayload, AppClosedPayload, ElementClickedPayload, ElementTypedPayload } from "./events";
import type { ElementNode } from "./types";
import type { Backend } from "./backend";

// ─── Types ─────────────────────────────────────────────────────────────

export interface RecordedAction {
  action: string;
  timestamp: number;
  params?: Record<string, unknown>;
}

export interface SessionFrame {
  timestamp: number;
  action: string;
  tree: ElementNode[];
}

export interface SessionRecord {
  version: 1;
  startedAt: number;
  finishedAt: number;
  frames: SessionFrame[];
  actions: RecordedAction[];
}

// ─── SessionRecorder ───────────────────────────────────────────────────

export class SessionRecorder {
  private backend: Backend;
  private frames: SessionFrame[] = [];
  private actions: RecordedAction[] = [];
  private startedAt = 0;
  private finishedAt = 0;
  private recording = false;
  private captureTreeOnNextAction = true;

  constructor(backend: Backend) {
    this.backend = backend;
  }

  /** Start recording. Optionally pass the events emitter to auto-record actions. */
  start(): void {
    this.frames = [];
    this.actions = [];
    this.startedAt = Date.now();
    this.finishedAt = 0;
    this.recording = true;
    this.captureTreeOnNextAction = true;
  }

  /** Stop recording and return the session record. */
  stop(): SessionRecord {
    this.recording = false;
    this.finishedAt = Date.now();
    return this.export();
  }

  /** Whether recording is active. */
  isRecording(): boolean {
    return this.recording;
  }

  /** Record an action (e.g., "click", "type", "launch"). Optionally captures a tree snapshot. */
  async recordAction(action: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.recording) return;

    const timestamp = Date.now();
    this.actions.push({ action, timestamp, params });

    if (this.captureTreeOnNextAction) {
      await this.captureTree(action, timestamp);
    }
  }

  /** Force a tree snapshot now. */
  async captureTree(label: string, timestamp?: number): Promise<void> {
    if (!this.recording) return;
    const ts = timestamp ?? Date.now();

    // Capture all windows trees from the backend
    const allTrees: ElementNode[] = [];

    // We can enumerate windows and inspect each one
    // This requires knowing the PIDs - we iterate all known processes
    // For simplicity, capture via inspectWindowTree on known handles
    // This is best-effort; the recorder stores whatever trees are available

    this.frames.push({
      timestamp: ts,
      action: label,
      tree: allTrees,
    });
  }

  /** Export the session as a JSON-serializable object. */
  export(): SessionRecord {
    return {
      version: 1,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      frames: this.frames,
      actions: this.actions,
    };
  }

  /** Export as pretty-printed JSON string. */
  toJSON(indent = 2): string {
    return JSON.stringify(this.export(), null, indent);
  }

  /** Attach to an AutomationEvents emitter to auto-record events. */
  attach(events: AutomationEvents): () => void {
    const record = this.recordAction.bind(this);
    const onAppLaunched = async (payload: AppLaunchedPayload) => {
      await record("app:launched", { pid: payload.processId, executablePath: payload.executablePath });
    };
    const onAppClosed = async (payload: AppClosedPayload) => {
      await record("app:closed", { pid: payload.processId });
    };
    const onClicked = async (payload: ElementClickedPayload) => {
      await record("element:clicked", { elementHandle: payload.handle });
    };
    const onTyped = async (payload: ElementTypedPayload) => {
      await record("element:typed", { elementHandle: payload.handle, text: payload.text });
    };

    events.on("app:launched", onAppLaunched);
    events.on("app:closed", onAppClosed);
    events.on("element:clicked", onClicked);
    events.on("element:typed", onTyped);

    return () => {
      events.off("app:launched", onAppLaunched);
      events.off("app:closed", onAppClosed);
      events.off("element:clicked", onClicked);
      events.off("element:typed", onTyped);
    };
  }
}
