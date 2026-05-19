/// <reference path="../../packages/core/dist/testing/globals.d.ts" />

import { TestAutomation } from "@win-auto/core";

describe("real Notepad automation", () => {
  it("launches Notepad and types text into the main editor", async () => {
    const automation = new TestAutomation();
    const app = await automation.launchApp({
      executablePath: "C:\\Windows\\System32\\notepad.exe"
    });

    const window = await app.waitForMainWindow();
    const element = await window.findElement({ role: "textbox" });
    expect(element).not.toBeNull();

    await element!.typeText("hello from win-auto native backend");
    await app.close();
  });
});
