import { EventEmitter } from "events";

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

export type AutomationEventPayload = {
  [K in AutomationEventType]: Record<string, unknown>;
};

export class AutomationEvents extends EventEmitter {
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

  public emitWindowBoundsChanged(handle: string, bounds: Record<string, unknown>): void {
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

  public emitElementFound(handle: string, selector: Record<string, unknown>): void {
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
