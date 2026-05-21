/// <reference path="../../packages/core/dist/testing/globals.d.ts" />

import { TestAutomation } from "@win-auto/core";

describe("real Calculator automation", () => {
  it("launches Calculator and clicks 1+2=", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const automation = new TestAutomation();
    const app = await automation.launchApp({
      executablePath: "C:\\Windows\\System32\\calc.exe",
    });

    const window = await app.waitForMainWindow({ timeoutMs: 4000, intervalMs: 30 });

    // clickSequence performs a SINGLE UIA tree traversal to find
    // and invoke all named elements — much faster than 4 separate calls.
    await window.clickSequence(["One", "Plus", "Two", "Equals"]);

    // wait briefly for the display to update
    await new Promise((resolve) => setTimeout(resolve, 100));
    const resultText = await window.findElementName("Display");
    expect(resultText).not.toBeNull();
    expect(resultText).toContain("3");

    await app.close({ timeoutMs: 2000, intervalMs: 30 });
  });
});
