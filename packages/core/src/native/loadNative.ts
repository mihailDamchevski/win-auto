import path from "node:path";
import type { NativeBindings } from "../api/types";

const CORE_FUNCTIONS: (keyof NativeBindings)[] = [
  "ping",
  "launch",
  "enumerateWindows",
  "findElement",
  "typeText",
  "sendKeys",
  "closeWindow",
  "closeApp",
  "isProcessRunning",
  "getText",
  "findElementName",
  "clickElement",
  "clickElementByName",
  "clickSequence",
  "pressKeyCodes",
  "getValue",
  "setValue",
  "selectElement",
  "toggleElement",
  "getToggleState",
  "findAll",
  "getParent",
  "getChildren",
  "getSiblings",
  "isVisible",
  "isEnabled",
  "isFocused",
  "getWindowBounds",
  "setWindowBounds",
  "maximizeWindow",
  "minimizeWindow",
  "restoreWindow",
  "pressKey",
];

const EXTENDED_FUNCTIONS: (keyof NativeBindings)[] = [
  "focusWindow",
  "rightClickElement",
  "doubleClickElement",
  "hoverElement",
  "mouseMove",
  "scrollElement",
  "dragDrop",
  "captureScreenshot",
  "captureScreenshotToFile",
  "findDialogs",
  "getDialogControls",
  "clickDialogButton",
  "setDialogFilePath",
  "findProcessesByName",
  "waitForProcessExit",
  "getProcessImageName",
  "killProcess",
  "getElementAttribute",
  "keyDown",
  "keyUp",
  "selectText",
  "getSelection",
  "replaceSelectedText",
  "inspectWindowTree",
];

const nativeSearchPaths = [
  "../../../../native/win-auto-native/win-auto-native.win32-x64-msvc.node",
  "../../../../native/win-auto-native/win-auto-native.win32-arm64-msvc.node",
  "../../../../native/win-auto-native/win_auto_native.node",
  "../../../../native/win-auto-native/index.node",
  "../../../../native/win-auto-native/index.js",
  "../../../../native/win-auto-native",
];

export function loadNativeBindings(): NativeBindings {
  for (const relativePath of nativeSearchPaths) {
    const resolvedPath = path.resolve(__dirname, relativePath);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(resolvedPath) as Record<string, unknown>;
      if (CORE_FUNCTIONS.every((fn) => typeof mod[fn] === "function")) {
        for (const fn of EXTENDED_FUNCTIONS) {
          if (typeof mod[fn] !== "function") {
            console.warn(`[win-auto] Native module missing extended function: ${fn}. Run npm run build:native to rebuild.`);
          }
        }
        return mod as NativeBindings;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    "Native module not found. Run `npm run build:native` at workspace root before calling native functions.",
  );
}
