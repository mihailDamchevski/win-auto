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
export type { Backend } from "./api/backend";
export type { AppSelector, ElementSelector, ElementNode, ElementPathStep, ElementPath, HwndNode, ImageMatch, LaunchOptions, LocatorFilter, MatchMode, ProcessEntry, WaitOptions, WindowBounds } from "./api/types";
export type { AutomationEventType } from "./api/events";
