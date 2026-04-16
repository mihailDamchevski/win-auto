import { describe, expect, it } from "vitest";
import { Automation } from "../../packages/core/src/api/automation";

async function waitForMainWindow(app: Awaited<ReturnType<Automation["launchApp"]>>): Promise<NonNullable<Awaited<ReturnType<typeof app.getMainWindow>>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const window = await app.getMainWindow();
    if (window) {
      return window;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("No top-level window found for launched process.");
}

describe("real Notepad automation", () => {
  it("launches Notepad and types text into the main editor", async () => {
    const automation = new Automation();
    const app = await automation.launchApp({
      executablePath: "C:\\Windows\\System32\\notepad.exe"
    });

    const window = await waitForMainWindow(app);
    const element = await window.findElement({ role: "textbox" });
    expect(element).not.toBeNull();

    await element!.typeText("hello from win-auto native backend");
  }, 30_000);
});
