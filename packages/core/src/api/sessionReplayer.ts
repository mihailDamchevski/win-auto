import type { Backend } from "./backend";
import type { SessionRecord, RecordedAction } from "./sessionRecorder";
import type { MockBackend } from "../mock/mockBackend";
import type { ElementNode } from "./types";
import type { MockTreeElement } from "../mock/mockRuntime";
import { AutomationError } from "./errors";
import { MockClock, DeterministicPoll } from "./deterministicWait";

// ─── Replay timeline entry ─────────────────────────────────────────────

interface ReplayStep {
  action: RecordedAction;
  deltaMs: number; // ms since previous action
}

// ─── SessionReplayer ───────────────────────────────────────────────────

export interface ReplayResult {
  success: boolean;
  stepsReplayed: number;
  totalSteps: number;
  errors: Array<{ step: number; action: string; error: string }>;
  durationMs: number;
}

export class SessionReplayer {
  private clock: MockClock;
  private poll: DeterministicPoll;
  private backend: Backend;
  private injectedProcessId: number | null = null;
  private injectedFrames: Set<number> = new Set();

  constructor(backend: Backend) {
    this.backend = backend;
    this.clock = new MockClock();
    this.poll = new DeterministicPoll(this.clock);
  }

  /** The virtual clock used during replay (for assertions). */
  getClock(): MockClock {
    return this.clock;
  }

  /** Load a session from a parsed JSON object. */
  static fromJSON(data: SessionRecord): SessionRecord {
    // Validate basic structure
    if (data.version !== 1) {
      throw new AutomationError(`Unsupported session version: ${data.version}`);
    }
    if (!Array.isArray(data.frames)) {
      throw new AutomationError("Invalid session: missing frames array");
    }
    if (!Array.isArray(data.actions)) {
      throw new AutomationError("Invalid session: missing actions array");
    }
    return data;
  }

  /**
   * Replay a session against the backend.
   * If `mockBackend` is provided and the session has tree frames, inject
   * the element trees at the appropriate times.
   */
  async replay(
    session: SessionRecord,
    mockBackend?: MockBackend,
    speed?: number,
  ): Promise<ReplayResult> {
    const speedFactor = speed ?? 1;
    if (speedFactor <= 0) {
      throw new AutomationError("Speed factor must be positive");
    }

    this.injectedProcessId = null;
    this.injectedFrames.clear();

    // Build timeline from recorded actions
    const steps = this.buildTimeline(session.actions);

    // If we have tree frames, inject them into the mock backend
    if (mockBackend && session.frames.length > 0) {
      // Pre-seed with the first frame
      const firstFrame = session.frames[0];
      if (firstFrame) {
        await this.ensureMockProcess(mockBackend);
        this.injectTreeFrame(mockBackend, firstFrame.tree);
      }
    }

    const errors: ReplayResult["errors"] = [];
    let stepIndex = 0;
    const replayStart = this.clock.now();

    for (const step of steps) {
      stepIndex++;

      // Advance time by the delta
      const adjustedDelta = Math.round(step.deltaMs / speedFactor);
      this.clock.advance(adjustedDelta);

      // Inject any tree frames that fall within this time window
      if (mockBackend) {
        this.injectMatchingFrames(mockBackend, session.frames, this.clock.now());
      }

      // Replay the action
      try {
        await this.replayAction(step.action);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          step: stepIndex,
          action: step.action.action,
          error: message,
        });
      }
    }

    const durationMs = this.clock.now() - replayStart;

    return {
      success: errors.length === 0,
      stepsReplayed: stepIndex - errors.length,
      totalSteps: steps.length,
      errors,
      durationMs,
    };
  }

  /** Build a timeline of actions with delta times. */
  private buildTimeline(actions: RecordedAction[]): ReplayStep[] {
    if (actions.length === 0) return [];

    const timeline: ReplayStep[] = [];
    let prevTs = actions[0].timestamp;

    for (const action of actions) {
      const deltaMs = Math.max(0, action.timestamp - prevTs);
      timeline.push({ action, deltaMs });
      prevTs = action.timestamp;
    }

    return timeline;
  }

  /** Ensure a mock process exists in the mock backend for tree injection. */
  private async ensureMockProcess(mockBackend: MockBackend): Promise<number> {
    if (this.injectedProcessId !== null) return this.injectedProcessId;
    const pid = await mockBackend.launch("replay-app");
    this.injectedProcessId = pid;
    return pid;
  }

  /** Convert ElementNode → MockTreeElement recursively. */
  private elementNodeToMockTree(node: ElementNode): MockTreeElement {
    return {
      id: node.handle,
      automationId: node.automationId || undefined,
      name: node.name || undefined,
      role: node.role || undefined,
      text: undefined,
      visible: node.isVisible,
      enabled: node.isEnabled,
      children: node.children?.length > 0
        ? node.children.map((child) => this.elementNodeToMockTree(child))
        : undefined,
    };
  }

  /** Inject tree frame data into the mock backend. */
  private injectTreeFrame(mockBackend: MockBackend, tree: ElementNode[]): void {
    for (const node of tree) {
      const mockTree = this.elementNodeToMockTree(node);
      mockBackend.setupElementTree(this.injectedProcessId!, mockTree, "Replay Window");
    }
  }

  /** Inject any frames whose timestamp matches the current clock time. */
  private injectMatchingFrames(
    mockBackend: MockBackend,
    frames: SessionRecord["frames"],
    now: number,
  ): void {
    for (let i = 0; i < frames.length; i++) {
      if (this.injectedFrames.has(i)) continue;
      // Tolerance: within 50ms of the current virtual time
      if (Math.abs(frames[i].timestamp - now) <= 50) {
        this.injectedFrames.add(i);
        this.injectTreeFrame(mockBackend, frames[i].tree);
      }
    }
  }

  /** Replay a single recorded action against the backend. */
  private async replayAction(action: RecordedAction): Promise<void> {
    switch (action.action) {
      case "app:launched": {
        const { executablePath } = action.params ?? {};
        if (typeof executablePath === "string") {
          await this.backend.launch(executablePath);
        }
        break;
      }
      case "app:closed": {
        const { pid } = action.params ?? {};
        if (typeof pid === "number") {
          await this.backend.closeApp(pid);
        }
        break;
      }
      case "element:clicked": {
        const { elementHandle } = action.params ?? {};
        if (typeof elementHandle === "string") {
          await this.backend.clickElement(elementHandle);
        }
        break;
      }
      case "element:typed": {
        const { elementHandle, text } = action.params ?? {};
        if (typeof elementHandle === "string" && typeof text === "string") {
          await this.backend.typeText(elementHandle, text);
        }
        break;
      }
      default:
        // Unknown actions are silently skipped
        break;
    }
  }

  /** Load a session from a JSON string. */
  static fromJSONString(json: string): SessionRecord {
    const data = JSON.parse(json) as SessionRecord;
    return SessionReplayer.fromJSON(data);
  }
}
