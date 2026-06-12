import { MockBackend } from "../mock/mockBackend";
import { Automation } from "../api/automation";
import { Element } from "../api/element";
import { AutomationEvents } from "../api/events";
import type { App } from "../api/app";
import type { Window } from "../api/window";
import type { MockTreeElement, MockElementRecord, MockWindowRecord } from "../mock/mockRuntime";

export type MockFixtureElements = Record<string, Element>;

export type MockFixtureOptions = {
  windowTitle?: string;
  executablePath?: string;
  elements?: MockTreeElement[];
};

export type MockFixture = {
  auto: Automation;
  mock: MockBackend;
  app: App;
  window: Window;
  elements: MockFixtureElements;
};

function toKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

/**
 * Create a complete mock fixture for testing without needing a real desktop.
 *
 * Usage:
 *   const { auto, app, window, mock, elements } = await createMockFixture({
 *     windowTitle: "TestApp",
 *     elements: [
 *       { name: "OK", role: "button", enabled: true, visible: true },
 *       { name: "Input", role: "textbox" },
 *     ],
 *   });
 *
 *   // Elements are keyed by their name (normalized to lowercase_no_spaces)
 *   await elements.ok.click();
 *   await elements.input.typeText("hello");
 */
export async function createMockFixture(options: MockFixtureOptions = {}): Promise<MockFixture> {
  const mock = new MockBackend();
  const auto = new Automation(mock);

  const executablePath = options.executablePath ?? "mock.exe";
  const app = await auto.launchApp({ executablePath });

  const windowTitle = options.windowTitle ?? "Mock Window";
  const mockAny = mock as unknown as {
    windowHandleToWin: Map<string, MockWindowRecord>;
    elementHandleToEl: Map<string, MockElementRecord>;
    nextElementHandle: number;
    registerElement(el: MockElementRecord, parentHandle: string | null): string;
    findPidByElementId(elId: string): number;
  };

  // Set the window title and clear default elements
  const firstWinHandle = [...mockAny.windowHandleToWin.keys()][0];
  const firstWin = mockAny.windowHandleToWin.get(firstWinHandle!);
  if (firstWin) {
    firstWin.title = windowTitle;
    if (options.elements && options.elements.length > 0) {
      firstWin.elements = [];
    }
  }

  // Build mock elements from the options
  const elements: MockFixtureElements = {};

  if (options.elements && firstWin) {
    let elCounter = 0;
    for (const elemDef of options.elements) {
      const key = elemDef.id ? toKey(elemDef.id) : (elemDef.name ? toKey(elemDef.name) : `el_${elCounter}`);
      const elId = elemDef.id ?? `fixture-el-${elCounter}`;

      const record: MockElementRecord = {
        id: elId,
        selector: {
          automationId: elemDef.automationId ?? null!,
          name: elemDef.name ?? null!,
          role: elemDef.role ?? "control",
          className: elemDef.className ?? null!,
          text: elemDef.text ?? null!,
        },
        text: elemDef.text ?? "",
        isSelected: false,
        isToggled: false,
        toggleState: "Off",
        isVisible: elemDef.visible ?? true,
        isEnabled: elemDef.enabled ?? true,
        isFocused: false,
        parentHandle: firstWin.id,
        childHandles: [],
      };
      // Clean up nulls
      record.selector = Object.fromEntries(
        Object.entries(record.selector).filter(([, v]) => v != null),
      ) as MockElementRecord["selector"];

      const handle = mockAny.registerElement(record, firstWinHandle!);
      firstWin.elements.push(record);

      const events = new AutomationEvents();
      elements[key] = new Element(handle, firstWinHandle!, mock, events, record.selector);
      elCounter++;
    }
  }

  const window = (await app.getMainWindow())!;
  return { auto, mock, app, window, elements };
}
