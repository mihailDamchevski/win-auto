/// <reference path="../../packages/core/dist/testing/globals.d.ts" />

import { loadNativeBindings } from "../../packages/core/src/native/loadNative";

describe("native module integration", () => {
  it("calls native ping and returns ok", () => {
    const native = loadNativeBindings();
    expect(native.ping()).toBe("ok");
  });
});
