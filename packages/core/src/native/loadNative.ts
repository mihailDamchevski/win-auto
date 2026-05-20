import path from "node:path";
import type { NativeBindings } from "../api/types";

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
      const mod = require(resolvedPath) as NativeBindings;
      if (
        typeof mod.ping === "function" &&
        typeof mod.launch === "function" &&
        typeof mod.enumerateWindows === "function" &&
        typeof mod.findElement === "function" &&
        typeof mod.typeText === "function" &&
        typeof mod.sendKeys === "function" &&
        typeof mod.closeWindow === "function" &&
        typeof mod.closeApp === "function" &&
        typeof mod.isProcessRunning === "function" &&
        typeof mod.getText === "function" &&
        typeof mod.findElementName === "function"
      ) {
        return mod;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    "Native module not found. Run `npm run build:native` at workspace root before calling native functions.",
  );
}
