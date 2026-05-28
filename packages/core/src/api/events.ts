import { EventEmitter } from "events";
import type { WindowBounds, ElementSelector } from "./types";

export type AutomationEventType =
  | "app:launched"
  | "app:closed"
  | "window:found"
  | "window:closed"
  | "window:boundsChanged"
  | "window:maximized"
  | "window:minimized"
  | "window:restored"
  | "element:found"
  | "element:clicked"
  | "element:rightClicked"
  | "element:doubleClicked"
  | "element:hovered"
  | "element:typed"
  | "element:selected"
  | "element:toggled"
  | "element:valueChanged"
  | "mouse:moved"
  | "element:screenshot"
  | "dialog:found"
  | "dialog:buttonClicked"
  | "dialog:fileSelected"
  | "process:connected"
  | "process:killed"
  | "process:exited"
  | "debug";

export type AppLaunchedPayload = { processId: number; executablePath: string; timestamp: number };
export type AppClosedPayload = { processId: number; timestamp: number };
export type WindowFoundPayload = { handle: string; processId: number; timestamp: number };
export type WindowClosedPayload = { handle: string; timestamp: number };
export type WindowBoundsChangedPayload = {
  handle: string;
  bounds: WindowBounds;
  timestamp: number;
};
export type WindowMaximizedPayload = { handle: string; timestamp: number };
export type WindowMinimizedPayload = { handle: string; timestamp: number };
export type WindowRestoredPayload = { handle: string; timestamp: number };
export type ElementFoundPayload = { handle: string; selector: ElementSelector; timestamp: number };
export type ElementClickedPayload = { handle: string; timestamp: number };
export type ElementRightClickedPayload = { handle: string; timestamp: number };
export type ElementDoubleClickedPayload = { handle: string; timestamp: number };
export type ElementHoveredPayload = { handle: string; timestamp: number };
export type ElementTypedPayload = { handle: string; text: string; timestamp: number };
export type ElementSelectedPayload = { handle: string; timestamp: number };
export type ElementToggledPayload = { handle: string; timestamp: number };
export type ElementValueChangedPayload = { handle: string; value: string; timestamp: number };
export type MouseMovedPayload = { x: number; y: number; timestamp: number };
export type ElementScreenshotPayload = { handle: string; timestamp: number };
export type ProcessConnectedPayload = { pid: number; imageName: string; timestamp: number };
export type ProcessKilledPayload = { pid: number; timestamp: number };
export type ProcessExitedPayload = { pid: number; timestamp: number };
export type DialogFoundPayload = { handle: string; title: string; timestamp: number };
export type DialogButtonClickedPayload = { handle: string; buttonText: string; timestamp: number };
export type DialogFileSelectedPayload = { handle: string; path: string; timestamp: number };
export type DebugPayload = { message: string; data?: Record<string, unknown>; timestamp: number };

export type AutomationEventPayload = {
  "app:launched": AppLaunchedPayload;
  "app:closed": AppClosedPayload;
  "window:found": WindowFoundPayload;
  "window:closed": WindowClosedPayload;
  "window:boundsChanged": WindowBoundsChangedPayload;
  "window:maximized": WindowMaximizedPayload;
  "window:minimized": WindowMinimizedPayload;
  "window:restored": WindowRestoredPayload;
  "element:found": ElementFoundPayload;
  "element:clicked": ElementClickedPayload;
  "element:rightClicked": ElementRightClickedPayload;
  "element:doubleClicked": ElementDoubleClickedPayload;
  "element:hovered": ElementHoveredPayload;
  "element:typed": ElementTypedPayload;
  "element:selected": ElementSelectedPayload;
  "element:toggled": ElementToggledPayload;
  "element:valueChanged": ElementValueChangedPayload;
  "mouse:moved": MouseMovedPayload;
  "element:screenshot": ElementScreenshotPayload;
  "dialog:found": DialogFoundPayload;
  "dialog:buttonClicked": DialogButtonClickedPayload;
  "dialog:fileSelected": DialogFileSelectedPayload;
  "process:connected": ProcessConnectedPayload;
  "process:killed": ProcessKilledPayload;
  "process:exited": ProcessExitedPayload;
  debug: DebugPayload;
};

export class AutomationEvents extends EventEmitter {
  public on<E extends AutomationEventType>(
    event: E,
    listener: (payload: AutomationEventPayload[E]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  public once<E extends AutomationEventType>(
    event: E,
    listener: (payload: AutomationEventPayload[E]) => void,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  public off<E extends AutomationEventType>(
    event: E,
    listener: (payload: AutomationEventPayload[E]) => void,
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  public emitAppLaunched(processId: number, executablePath: string): void {
    this.emit("app:launched", { processId, executablePath, timestamp: Date.now() });
  }

  public emitAppClosed(processId: number): void {
    this.emit("app:closed", { processId, timestamp: Date.now() });
  }

  public emitWindowFound(handle: string, processId: number): void {
    this.emit("window:found", { handle, processId, timestamp: Date.now() });
  }

  public emitWindowClosed(handle: string): void {
    this.emit("window:closed", { handle, timestamp: Date.now() });
  }

  public emitWindowBoundsChanged(handle: string, bounds: WindowBounds): void {
    this.emit("window:boundsChanged", { handle, bounds, timestamp: Date.now() });
  }

  public emitWindowMaximized(handle: string): void {
    this.emit("window:maximized", { handle, timestamp: Date.now() });
  }

  public emitWindowMinimized(handle: string): void {
    this.emit("window:minimized", { handle, timestamp: Date.now() });
  }

  public emitWindowRestored(handle: string): void {
    this.emit("window:restored", { handle, timestamp: Date.now() });
  }

  public emitElementFound(handle: string, selector: ElementSelector): void {
    this.emit("element:found", { handle, selector, timestamp: Date.now() });
  }

  public emitElementClicked(handle: string): void {
    this.emit("element:clicked", { handle, timestamp: Date.now() });
  }

  public emitElementRightClicked(handle: string): void {
    this.emit("element:rightClicked", { handle, timestamp: Date.now() });
  }

  public emitElementDoubleClicked(handle: string): void {
    this.emit("element:doubleClicked", { handle, timestamp: Date.now() });
  }

  public emitElementHovered(handle: string): void {
    this.emit("element:hovered", { handle, timestamp: Date.now() });
  }

  public emitElementTyped(handle: string, text: string): void {
    this.emit("element:typed", { handle, text, timestamp: Date.now() });
  }

  public emitElementSelected(handle: string): void {
    this.emit("element:selected", { handle, timestamp: Date.now() });
  }

  public emitElementToggled(handle: string): void {
    this.emit("element:toggled", { handle, timestamp: Date.now() });
  }

  public emitElementValueChanged(handle: string, value: string): void {
    this.emit("element:valueChanged", { handle, value, timestamp: Date.now() });
  }

  public emitMouseMoved(x: number, y: number): void {
    this.emit("mouse:moved", { x, y, timestamp: Date.now() });
  }

  public emitElementScreenshot(handle: string): void {
    this.emit("element:screenshot", { handle, timestamp: Date.now() });
  }

  public emitProcessConnected(pid: number, imageName: string): void {
    this.emit("process:connected", { pid, imageName, timestamp: Date.now() });
  }

  public emitProcessKilled(pid: number): void {
    this.emit("process:killed", { pid, timestamp: Date.now() });
  }

  public emitDialogFound(handle: string, title: string): void {
    this.emit("dialog:found", { handle, title, timestamp: Date.now() });
  }

  public emitDialogButtonClicked(handle: string, buttonText: string): void {
    this.emit("dialog:buttonClicked", { handle, buttonText, timestamp: Date.now() });
  }

  public emitDialogFileSelected(handle: string, path: string): void {
    this.emit("dialog:fileSelected", { handle, path, timestamp: Date.now() });
  }

  public emitProcessExited(pid: number): void {
    this.emit("process:exited", { pid, timestamp: Date.now() });
  }

  public emitDebug(message: string, data?: Record<string, unknown>): void {
    this.emit("debug", { message, data, timestamp: Date.now() });
  }
}
