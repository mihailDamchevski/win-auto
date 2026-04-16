import type { ElementSelector, LaunchOptions } from "../api/types";

export type MockElementRecord = {
  id: string;
  selector: ElementSelector;
  text: string;
};

export type MockWindowRecord = {
  id: string;
  title: string;
  elements: MockElementRecord[];
};

export type MockAppRecord = {
  id: string;
  executablePath: string;
  title: string;
  windows: MockWindowRecord[];
};

const DELAY_MS = 15;

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

function selectorMatches(recordSelector: ElementSelector, query: ElementSelector): boolean {
  if (query.automationId && recordSelector.automationId !== query.automationId) {
    return false;
  }
  if (query.name && recordSelector.name !== query.name) {
    return false;
  }
  if (query.role && recordSelector.role !== query.role) {
    return false;
  }
  return true;
}

export class MockRuntime {
  private appCounter = 1;
  private windowCounter = 1;
  private elementCounter = 1;

  private apps = new Map<string, MockAppRecord>();

  public async launchApp(options: LaunchOptions): Promise<MockAppRecord> {
    await wait();
    const appId = `app-${this.appCounter++}`;
    const windowId = `win-${this.windowCounter++}`;
    const defaultElement: MockElementRecord = {
      id: `el-${this.elementCounter++}`,
      selector: { automationId: "main-input", name: "Main Input", role: "textbox" },
      text: ""
    };

    const app: MockAppRecord = {
      id: appId,
      executablePath: options.executablePath,
      title: options.title ?? "Mock App",
      windows: [{ id: windowId, title: options.title ?? "Main Window", elements: [defaultElement] }]
    };
    this.apps.set(appId, app);
    return app;
  }

  public async listApps(): Promise<MockAppRecord[]> {
    await wait();
    return [...this.apps.values()];
  }

  public async getAppById(appId: string): Promise<MockAppRecord | null> {
    await wait();
    return this.apps.get(appId) ?? null;
  }

  public async closeApp(appId: string): Promise<void> {
    await wait();
    this.apps.delete(appId);
  }

  public async findElement(windowRecord: MockWindowRecord, selector: ElementSelector): Promise<MockElementRecord | null> {
    await wait();
    const match = windowRecord.elements.find((record) => selectorMatches(record.selector, selector));
    return match ?? null;
  }

  public async listElements(windowRecord: MockWindowRecord, selector: ElementSelector): Promise<MockElementRecord[]> {
    await wait();
    return windowRecord.elements.filter((record) => selectorMatches(record.selector, selector));
  }

  public async setElementText(windowRecord: MockWindowRecord, elementId: string, text: string): Promise<void> {
    await wait();
    const element = windowRecord.elements.find((record) => record.id === elementId);
    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }
    element.text = text;
  }
}

export const runtime = new MockRuntime();
