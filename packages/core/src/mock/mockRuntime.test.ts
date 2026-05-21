import { beforeEach, describe, expect, it } from "vitest";
import { MockRuntime, runtime } from "./mockRuntime";

describe("MockRuntime", () => {
  beforeEach(async () => {
    for (const app of await runtime.listApps()) {
      await runtime.closeApp(app.id);
    }
  });

  it("launches a mock app and finds elements", async () => {
    const app = await runtime.launchApp({
      executablePath: "C:\\Windows\\System32\\notepad.exe",
      title: "Notepad",
    });
    expect(app.windows.length).toBe(1);

    const firstWindow = app.windows[0];
    const element = await runtime.findElement(firstWindow, {
      role: "textbox",
    });
    expect(element).not.toBeNull();
    expect(element!.selector.role).toBe("textbox");

    await runtime.setElementText(firstWindow, element!.id, "hello");
    expect(element!.text).toBe("hello");
  });
});
