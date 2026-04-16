import { Window } from "./window";
import { Element } from "./element";
import { loadNativeBindings } from "../native/loadNative";

export class App {
  public readonly processId: number;
  public readonly executablePath: string;
  public readonly title: string;

  constructor(processId: number, executablePath: string, title: string) {
    this.processId = processId;
    this.executablePath = executablePath;
    this.title = title;
  }

  public async listWindows(): Promise<Window[]> {
    const handles = await loadNativeBindings().enumerateWindows(this.processId);
    return handles.map((handle) => new Window(handle, this.processId));
  }

  public async getMainWindow(): Promise<Window | null> {
    const windows = await this.listWindows();
    if (windows.length === 0) {
      return null;
    }
    return windows[0];
  }

  public async find(selector: { automationId?: string; name?: string; role?: string }): Promise<Element | null> {
    const mainWindow = await this.getMainWindow();
    if (!mainWindow) {
      return null;
    }
    return mainWindow.findElement(selector);
  }

  public async close(): Promise<void> {
    // Keep lifecycle control in JS for now; process close support can be added natively later.
    await Promise.resolve();
  }
}
