/// <reference path="../../packages/core/dist/testing/globals.d.ts" />

import { TestAutomation } from "@win-auto/core";

describe("real Calculator automation", () => {
  it("launches Calculator and enters 1+2=", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const automation = new TestAutomation();
    const app = await automation.launchApp({
      executablePath: "C:\\Windows\\System32\\calc.exe",
    });

    const window = await app.waitForMainWindow();
    expect(window).not.toBeNull();

    await window.typeText("1+2=");

    const resultText = await window.findElementName("Display");
    expect(resultText).not.toBeNull();
    expect(resultText).toContain("3");

    await app.close();
  });
});
