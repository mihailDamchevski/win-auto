import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { NativeBindings } from "../api/types";
import { BackendError } from "../api/errors";

// CJS-compatible import.meta shim — in ESM builds import.meta is available,
// in CJS builds the try block throws and we fall back to __dirname / require.
function getModuleUrl(): string {
  // @ts-ignore — import.meta is only valid with --module es2022+
  try {
    return (import.meta as { url: string }).url;
  } catch {
    return "";
  }
}

function getNodeRequire(): NodeRequire {
  // @ts-ignore — import.meta is only valid with --module es2022+
  try {
    return createRequire((import.meta as { url: string }).url);
  } catch {
    return require;
  }
}

function getModuleDirname(): string {
  const url = getModuleUrl();
  return url ? path.dirname(fileURLToPath(url)) : __dirname;
}

/** Walk up from `dir` until we find a directory that contains `target`, return the path. */
function findUp(dir: string, target: string): string | null {
  let current = path.resolve(dir);
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(current, target))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

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
  "focusElement",
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

function buildNativeSearchPaths(mainDir: string): string[] {
  // Try to find the repo root by looking for native/win-auto-native/
  const repoRoot = findUp(mainDir, path.join("native", "win-auto-native"));
  if (repoRoot) {
    const nativeDir = path.join(repoRoot, "native", "win-auto-native");
    return [
      path.join(nativeDir, "win-auto-native.win32-x64-msvc.node"),
      path.join(nativeDir, "win-auto-native.win32-arm64-msvc.node"),
      path.join(nativeDir, "win_auto_native.node"),
      path.join(nativeDir, "index.node"),
      path.join(nativeDir, "index.js"),
      nativeDir,
    ];
  }
  // Fallback: relative paths from the module directory (legacy)
  return [
    "../../../../native/win-auto-native/win-auto-native.win32-x64-msvc.node",
    "../../../../native/win-auto-native/win-auto-native.win32-arm64-msvc.node",
    "../../../../native/win-auto-native/win_auto_native.node",
    "../../../../native/win-auto-native/index.node",
    "../../../../native/win-auto-native/index.js",
    "../../../../native/win-auto-native",
  ];
}

export function loadNativeBindings(): NativeBindings {
  const _require = getNodeRequire();
  const _dirname = getModuleDirname();
  const searchPaths = buildNativeSearchPaths(_dirname);

  for (const resolvedPath of searchPaths) {
    try {
      const mod = _require(resolvedPath) as Record<string, unknown>;
      if (CORE_FUNCTIONS.every((fn) => typeof mod[fn] === "function")) {
        for (const fn of EXTENDED_FUNCTIONS) {
          if (typeof mod[fn] !== "function") {
            console.warn(
              `[win-auto] Native module missing extended function: ${fn}. Run npm run build:native to rebuild.`,
            );
          }
        }
        return mod as NativeBindings;
      }
    } catch {
      continue;
    }
  }

  throw new BackendError(
    "Native module not found. Run `npm run build:native` at workspace root before calling native functions.",
    "native",
  );
}
