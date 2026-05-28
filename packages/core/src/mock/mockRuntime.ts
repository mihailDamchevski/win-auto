import type { ElementSelector, LaunchOptions, MatchMode, WindowBounds } from "../api/types";
import { AutomationError } from "../api/errors";

function matchesValue(
  actual: string | undefined,
  query: string | undefined | null,
  mode: MatchMode | undefined | null,
): boolean {
  if (query == null || query === "") return true;
  if (actual == null) return false;
  const m = mode ?? "substring";
  switch (m) {
    case "exact":
      return actual === query;
    case "regex":
      try {
        return new RegExp(query, "i").test(actual);
      } catch {
        return false;
      }
    case "substring":
    default:
      return actual.toLowerCase().includes(query.toLowerCase());
  }
}

export type MockElementRecord = {
  id: string;
  selector: ElementSelector;
  text: string;
  isSelected: boolean;
  isToggled: boolean;
  toggleState: "On" | "Off" | "Indeterminate";
  isVisible: boolean;
  isEnabled: boolean;
  isFocused: boolean;
  parentHandle: string | null;
  childHandles: string[];
};

export type MockDialogRecord = {
  id: string;
  title: string;
  buttons: string[];
  filePath: string;
};

export type MockWindowRecord = {
  id: string;
  title: string;
  elements: MockElementRecord[];
  bounds: WindowBounds;
  isMaximized: boolean;
  isMinimized: boolean;
  isFocused: boolean;
};

export type MockAppRecord = {
  id: string;
  executablePath: string;
  title: string;
  windows: MockWindowRecord[];
  dialogs: MockDialogRecord[];
};

/** Tree structure for MockBackend.setupElementTree() */
export type MockTreeElement = {
  id?: string;
  automationId?: string;
  name?: string;
  role?: string;
  className?: string;
  text?: string;
  visible?: boolean;
  enabled?: boolean;
  children?: MockTreeElement[];
};

export function createDefaultElement(
  id: string,
  selector?: Partial<ElementSelector>,
): MockElementRecord {
  return {
    id,
    selector: { automationId: "main-input", name: "Main Input", role: "textbox", ...selector },
    text: "",
    isSelected: false,
    isToggled: false,
    toggleState: "Off",
    isVisible: true,
    isEnabled: true,
    isFocused: false,
    parentHandle: null,
    childHandles: [],
  };
}

export function createDefaultWindow(id: string, title: string): MockWindowRecord {
  return {
    id,
    title,
    elements: [],
    bounds: { left: 100, top: 50, width: 800, height: 600 },
    isMaximized: false,
    isMinimized: false,
    isFocused: false,
  };
}

export function createDefaultApp(id: string, executablePath: string): MockAppRecord {
  return {
    id,
    executablePath,
    title: "Mock App",
    windows: [],
    dialogs: [],
  };
}

const DELAY_MS = 15;

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

function selectorMatches(recordSelector: ElementSelector, query: ElementSelector): boolean {
  const mode = query.matchMode;
  if (!matchesValue(recordSelector.automationId, query.automationId, mode)) return false;
  if (!matchesValue(recordSelector.name, query.name, mode)) return false;
  if (!matchesValue(recordSelector.role, query.role, mode)) return false;
  if (!matchesValue(recordSelector.className, query.className, mode)) return false;
  if (!matchesValue(recordSelector.text, query.text, mode)) return false;
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
    const defaultElement = createDefaultElement(`el-${this.elementCounter++}`, {
      automationId: "main-input",
      name: "Main Input",
      role: "textbox",
    });
    const window = createDefaultWindow(windowId, options.title ?? "Main Window");
    window.elements.push(defaultElement);
    defaultElement.parentHandle = windowId;

    const app = createDefaultApp(appId, options.executablePath);
    app.title = options.title ?? "Mock App";
    app.windows.push(window);
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

  public async findElement(
    windowRecord: MockWindowRecord,
    selector: ElementSelector,
  ): Promise<MockElementRecord | null> {
    await wait();
    const match = windowRecord.elements.find((record) =>
      selectorMatches(record.selector, selector),
    );
    return match ?? null;
  }

  public async listElements(
    windowRecord: MockWindowRecord,
    selector: ElementSelector,
  ): Promise<MockElementRecord[]> {
    await wait();
    return windowRecord.elements.filter((record) => selectorMatches(record.selector, selector));
  }

  public async setElementText(
    windowRecord: MockWindowRecord,
    elementId: string,
    text: string,
  ): Promise<void> {
    await wait();
    const element = windowRecord.elements.find((record) => record.id === elementId);
    if (!element) {
      throw new AutomationError(`Element not found: ${elementId}`);
    }
    element.text = text;
  }
}

export const runtime = new MockRuntime();
