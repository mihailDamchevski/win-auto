import { beforeEach, describe, expect, it, vi } from "vitest";
import { Automation } from "../api/automation";

const nativeMock = {
  ping: vi.fn(() => "ok"),
  launch: vi.fn(async () => 4242),
  enumerateWindows: vi.fn(async () => ["100"]),
  findElement: vi.fn(async () => "200"),
  typeText: vi.fn(async () => undefined)
};

vi.mock("../native/loadNative", () => ({
  loadNativeBindings: () => nativeMock
}));

describe("native API wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps async object flow through native bindings", async () => {
    const automation = new Automation();
    const app = await automation.launchApp({
      executablePath: "C:\\Windows\\System32\\notepad.exe",
      title: "Notepad"
    });
    const window = await app.getMainWindow();
    const element = await window?.findElement({ role: "textbox" });
    await element?.typeText("hello");

    expect(app.processId).toBe(4242);
    expect(nativeMock.launch).toHaveBeenCalledTimes(1);
    expect(nativeMock.enumerateWindows).toHaveBeenCalledWith(4242);
    expect(nativeMock.findElement).toHaveBeenCalled();
    expect(nativeMock.typeText).toHaveBeenCalledWith("200", "hello");
  });
});
