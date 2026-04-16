import { describe, expect, it } from "vitest";
import { Automation } from "win-auto";

describe("sample desktop automation test", () => {
  it("runs mock async flow", async () => {
    const automation = new Automation();
    const app = await automation.launchApp({
      executablePath: "C:\\Program Files\\Mock\\app.exe",
      title: "Sample App"
    });
    const window = await app.getMainWindow();
    const input = await window?.findElement({ automationId: "main-input", role: "textbox" });
    await input?.typeText("hello from generated project");
    expect(await input?.getText()).toBe("hello from generated project");
  });
});
