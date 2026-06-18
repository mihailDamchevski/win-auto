export { Automation } from "./api/automation";
export { App } from "./api/app";
export { Window } from "./api/window";
export { Element } from "./api/element";
export { Locator } from "./api/locator";
export { Dialog, DialogManager } from "./api/dialog";
export { ProcessInfo, ProcessManager } from "./api/process";
export { TestAutomation, trackApp, closeTrackedApps } from "./api/testAutomation";
export { NativeBackend } from "./api/native-backend";
export { MockBackend } from "./mock/mockBackend";
export { AutomationEvents } from "./api/events";
export { wait, WaitCondition, ElementWait, WindowWait, WaitBuilder } from "./api/wait";
export {
  AutomationError,
  ElementNotFoundError,
  WindowNotFoundError,
  StaleElementError,
  PermissionDeniedError,
  TimeoutError,
  BackendError,
  PatternNotSupportedError,
} from "./api/errors";
export type { Backend, WinEventInfo } from "./api/backend";
export type {
  AppSelector,
  ElementSelector,
  ElementNode,
  ElementPathStep,
  ElementPath,
  HwndNode,
  ImageMatch,
  LaunchOptions,
  LocatorFilter,
  MatchMode,
  ProcessEntry,
  WaitOptions,
  WindowBounds,
} from "./api/types";
export type {
  AutomationEventType,
  AutomationEventPayload,
  AppLaunchedPayload,
  AppClosedPayload,
  WindowFoundPayload,
  WindowClosedPayload,
  WindowBoundsChangedPayload,
  WindowMaximizedPayload,
  WindowMinimizedPayload,
  WindowRestoredPayload,
  ElementFoundPayload,
  ElementClickedPayload,
  ElementRightClickedPayload,
  ElementDoubleClickedPayload,
  ElementHoveredPayload,
  ElementTypedPayload,
  ElementSelectedPayload,
  ElementToggledPayload,
  ElementValueChangedPayload,
  MouseMovedPayload,
  ElementScreenshotPayload,
  ElementStaleRecoveredPayload,
  ProcessConnectedPayload,
  ProcessKilledPayload,
  ProcessExitedPayload,
  DialogFoundPayload,
  DialogButtonClickedPayload,
  DialogFileSelectedPayload,
  WinEventPayload,
  DebugPayload,
} from "./api/events";
export { TraceRecorder, setCurrentTraceRecorder, getCurrentTraceRecorder } from "./api/trace";
export type { TraceEventType, TraceEntry, TraceSession, TraceTimingCategory } from "./api/trace";
export { FailureBundle } from "./api/failureBundle";
export type { FailureBundleData, FailureBundleAppEntry } from "./api/failureBundle";
export { FlakyHistoryStore } from "./testing/flakyHistory";
export type { FlakyRecord, FlakySummary, FlakyCluster, FlakyReport, FailureMode } from "./testing/flakyHistory";
export { initFlakyTracking, recordFlakyResult, isTestQuarantined, generateFlakyReport } from "./testing/flaky";
export type { FlakyOptions } from "./testing/flaky";
export { MockClock, DeterministicPoll, DeterministicBackendPoller } from "./api/deterministicWait";
export type { Clock, PollFn } from "./api/deterministicWait";
export { SessionRecorder } from "./api/sessionRecorder";
export type { SessionRecord, RecordedAction, SessionFrame } from "./api/sessionRecorder";
export { SessionReplayer } from "./api/sessionReplayer";
export type { ReplayResult } from "./api/sessionReplayer";
