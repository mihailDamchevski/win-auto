import { describe, expect, it } from "vitest";
import { Automation } from "../../packages/core/src/api/automation";

describe("native module integration", () => {
  it("calls native ping and returns ok", () => {
    const automation = new Automation();
    const result = automation.pingNative();
    expect(result).toBe("ok");
  });
});
