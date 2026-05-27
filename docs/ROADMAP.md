# win-auto — Roadmap

> Building a tank-grade desktop automation framework.
>
> The goal: **legacy and modern apps, automated reliably, without
> fragile hacks.**

---

## ✅ Done

| # | Task | Completed |
|---|---|---|
| Q5 | `classNames`/`executable` filtering in MockBackend | 2026-05-27 |

---

## Quick wins (1–2 weeks)

| # | Task | Why it matters now |
|---|---|---|
| Q1 | **Structured Rust errors** — replace `napi_error("string")` with `thiserror` enum: `ElementNotFound`, `ComInitFailed`, `PermissionDenied`, `PatternNotSupported`. Map to proper napi-rs status codes. | Every Rust error currently surfaces as `GenericFailure` — TS consumers cannot distinguish "element not found" from "access denied" without parsing message strings. |
| Q2 | **Typed event payloads** — wire `AutomationEventPayload` mapped type into `AutomationEvents.on()` so every event has a typed payload. | Event consumers have zero type safety today. The type infrastructure already exists but is unused. |
| Q3 | **Wire up missing event emissions** — `dialog:found`, `dialog:buttonClicked`, `dialog:fileSelected`, `process:exited` are in the type union but never emitted. Emit `element:found` during poll loops. | Silent omissions confuse debuggers and force workarounds. |
| Q4 | **Bare `catch {}` in stale recovery** — replace with type-checked catch that only retries on `ElementNotFound`/`StaleElement` errors, not permission or crash errors. | Current code catches ALL errors during stale-element retry, masking real backend failures. |
| Q5 | **`classNames` filtering in MockBackend** — `findElement`/`findAll`/`enumerateWindows` now filter by `classNames` and `executable`. | ✅ Done |

---

## Phase 1 — Foundation Hardening (Chassis)

Estimated: 2 weeks  
Impact: **Critical** — every layer depends on this.

### 1.1 Custom error hierarchy (TS)

```
AutomationError
  ├── ElementNotFoundError   { selector, windowHandle, lastSnapshot? }
  ├── WindowNotFoundError     { processId, timeoutMs }
  ├── StaleElementError       { oldHandle, newHandle? }
  ├── PermissionDeniedError   { handle, isUipibarrier? }
  ├── TimeoutError            { operation, timeoutMs }
  ├── BackendError            { backendName, cause }
  └── PatternNotSupportedError { handle, patternName }
```

- All classes extend `AutomationError` which extends `Error`.
- Consumers can `if (err instanceof ElementNotFoundError)` instead of parsing strings.
- Error builders (`buildElementNotFoundError`) return typed errors.

### 1.2 Thread-safe COM init (Rust)

- Replace per-function `ComGuard` with a per-Tokio-task COM scope via `task_local!`.
- Thread-local `IUIAutomation` cache should also handle COM reinitialization across threads.
- Proper `CoUninitialize` on Tokio task exit.

### 1.3 Stale-element recovery v2

- Bare `catch {}` → `catch (err)` with error-type check before retry.
- Configurable retry count (default 1) via `WinAutoConfig.retryOnStale`.
- Exponential backoff between retries: 100ms, 200ms, 400ms.
- Emit `element:stale-recovered` event.

### 1.4 Event system hardening

- Every `AutomationEventType` gets a typed payload interface.
- `AutomationEventPayload[T]` mapped type used in `on<T>(event, handler)`.
- Add `off()` / `removeAllListeners(event?)` typed helpers.
- `process:exited` emission wired to `App.waitForExit()` and `App.close()`.
- `dialog:found/buttonClicked/fileSelected` emissions wired in `Dialog` methods.

---

## Phase 2 — Element Discovery Overhaul (Handling Fragile UIs)

Estimated: 3–4 weeks  
Impact: **Critical** — this is the #1 community pain point.

### 2.1 Multi-strategy healing engine

Build `HealingLocator` that auto-falls back through strategies:

```
1. AutomationId          → fastest, most stable (hash lookup)
2. Name (exact)          → human-readable, often stable
3. Role + ClassName      → structural matching
4. Name (substring)      → partial text match
5. XPath path            → buildElementPath / resolveElementPath
6. Role + sibling index  → tree-position relative
7. className (HWND)      → Win32 class name (e.g. "ThunderRT6TextBox")
8. Image template        → OCR / template matching (last resort)
```

- Each strategy returns `{ handle, confidence, latencyMs }`.
- `find()` tries strategies in order, returns the first with `confidence >= threshold`.
- `waitFor()` runs all strategies in parallel when `parallel: true`, takes the fastest high-confidence match.
- All diagnostics logged when `WIN_AUTO_DEBUG_LOCATORS=1`.

### 2.2 LegacyIAccessible pattern (Rust)

- Add `IUIAutomationLegacyIAccessiblePattern` support in the native backend.
- `getElementAttribute("legacyName")`, `getElementAttribute("legacyRole")`, `getElementAttribute("legacyState")`.
- `findElement` falls back to `LegacyIAccessible::Name` when standard UIA properties are empty.
- This exposes elements in VB6, MFC, Delphi, and other legacy frameworks that support MSAA but not full UIA.

### 2.3 Win32 class-name first-class support

- Add `className` as a top-level filter in `ElementSelector` (already in the type, promote it).
- Native `findElement` pre-filters by class name before UIA property matching when `className` is provided.
- Expose `getClassName()` on `Element` (returns Win32 window class).

### 2.4 Scope & structural navigation

- `Element.findRelative(selector, { relation: "ancestor" | "parent" | "nextSibling" | "previousSibling" })`.
- `Locator.ancestor(selector)` / `Locator.parent()` / `Locator.next(selector)`.
- Scope container (`within()`) uses `findAll` + tree-aware filtering, not just single `findElement`.

---

## Phase 3 — Fluent Wait & Timing System

Estimated: 2 weeks  
Impact: **Critical** — desktop automation lives or dies by wait reliability.

### 3.1 `wait.until()` fluent API

```typescript
import { wait } from "@win-auto/core";

await wait.until(() => element.getText()).matches(/loaded/).for(10000);
await wait.until(window).isVisible().for(5000);
await wait.until(element).isEnabled();
await wait.until(() => backend.findElement(s)).exists();
```

Backed by the same `poll` + `waitForUiChange` infrastructure. Chainable:

- `.until(condition)` — condition function or object with `.isVisible()`, etc.
- `.matches(predicate)` — `(value) => boolean`
- `.equals(expected)` — strict equality
- `.for(timeoutMs)` — set timeout (default from config)
- `.polling(intervalMs)` — custom poll interval
- `.and(otherCondition)` / `.or(otherCondition)` — compound conditions

### 3.2 Inverse waits

```typescript
await element.waitForNotVisible({ timeoutMs: 5000 });
await element.waitForNotEnabled();
await element.waitForRemoved();
await window.waitForClosed();
await app.waitForProcessExit(10000);
```

### 3.3 Compound conditions

```typescript
await wait.until(element).isVisible()
  .and(el => el.getText().then(t => t.includes("ready")))
  .for(10000);

await wait.until(element).hasText("loaded")
  .or(() => element.getText().then(t => t.includes("error")));
```

### 3.4 Adaptive poll intervals

- Start at 10ms, double on each unsuccessful cycle (10 → 20 → 40 → 80 → 160 → 320 → 500 max).
- Respect `waitForUiChange` as primary signal; only poll at minimum interval when no change detected.
- Configurable via `WinAutoConfig.pollInterval: "adaptive" | number`.

---

## Phase 4 — Dual Input Mode

Estimated: 3 weeks  
Impact: **High** — expands supported app types significantly.

### 4.1 enigo hardware input (Rust)

- Add `enigo` crate as optional dependency behind `input-hardware` feature.
- Configurable input mode per `Automation` instance and per `App`:
  - `"pattern"` — UIA Invoke/ValuePattern (background, no focus needed).
  - `"hardware"` — enigo/SendInput (requires foreground focus, works everywhere).
  - `"auto"` — try pattern first, fall back to hardware on `PatternNotSupported`.
- `automation.connectApp({ mode: "background" })` for CI/CD (pattern only, no focus).

### 4.2 UIA pattern expansion (Rust)

| Pattern | Purpose |
|---|---|
| `ExpandCollapsePattern` | Tree items, combo box expand/collapse |
| `ScrollPattern` | Proper scrollable container control (vs. current WM_VSCROLL) |
| `RangeValuePattern` | Sliders, spin buttons, progress bars |
| `SelectionPattern` | List boxes, list views (multi-select support) |
| `GridPattern` / `TablePattern` | Data grids with row/column navigation |
| `WindowPattern` (full) | `SetVisualState`, `WaitForInputIdle`, `Close` |

Each pattern exposed as:
- `element.getPattern<T>(patternName)` returns a pattern object.
- `element.invoke()`, `element.expand()`, `element.collapse()`, `element.scroll(options)`, etc.

---

## Phase 5 — Image Recognition Overhaul

Estimated: 3–4 weeks  
Impact: **High** — critical for legacy apps with no programmatic handles.

### 5.1 FFT-based template matching (Rust)

- Replace NCC with FFT convolution using `rustfft` crate.
- Complexity: O(N log N) vs. O(N²) for large templates.
- 10–100x speedup on 4K screenshots.
- Feature-gated behind `image-fft`.

### 5.2 Multi-scale matching

- Generate template pyramid: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x.
- Match at each scale, return best result with scale info.
- Configurable scales in `findImage(template, { scales: [0.75, 1.0, 1.25] })`.

### 5.3 Region-of-interest

```typescript
const match = await window.findImage(template, {
  roi: { x: 100, y: 200, width: 400, height: 300 },
  minConfidence: 0.8,
});
```

### 5.4 OCR integration (future)

- `window.findText("label text", { ocr: true })` finds elements by rendered text.
- Use `Windows.Media.Ocr` via `windows-rs` crate.
- Falls back when UIA text is unavailable (image-only controls, custom drawn text).

### 5.5 Image match diagnostics

- `WIN_AUTO_DEBUG_IMAGES=1` saves debug overlays (matched region highlighted) to `debug-images/`.
- `ImageMatch.debugOverlay` — PNG buffer of the match region.
- `ImageMatch.boundingBox` — screen coordinates.

---

## Phase 6 — Legacy App Toolkit

Estimated: 3 weeks  
Impact: **High** — the differentiating feature for "tank-grade."

### 6.1 DirectUIHWND / modern dialog support

- Detect `DirectUIHWND` and `Windows.UI.Core.CoreWindow` class windows.
- For DirectUIHWND: use `AcceleratorAccessibility` / WM_GETOBJECT to enumerate.
- For UWP dialogs: use `IUIAutomation` with native CoreWindow activation.
- Expose `Dialog.type: "standard" | "directui" | "uwp"` for handling differences.

### 6.2 Deep HWND tree inspection

- `Window.getLegacyInfo()` returns full Win32 diagnostics: `{ className, text, style, exStyle, pid, threadId, isUnicode, parentHwnd, ownerHwnd, dpi }`.
- CLI: `win-auto inspect --hwnd` shows the raw HWND tree with class names.
- `win-auto diagnose --hwnd` shows recommended selectors based on class names.

### 6.3 WM_COMMAND / WM_NOTIFY injection

```typescript
await window.sendWmCommand(controlHandle, commandId);
await window.sendWmSetText(controlHandle, text);
await window.sendWmNotify(controlHandle, notificationCode);
```

- For controls that only respond to Win32 messages, not UIA.
- Common with VB6, MFC, and Delphi apps.

### 6.4 Process launch expansion

```typescript
await automation.launchApp({
  executablePath: "legacy.exe",
  args: ["--config", "settings.ini"],
  workingDirectory: "C:\\App\\Data",
  env: { MY_APP_MODE: "test" },
  runAs: "admin",        // ShellExecuteExW with "runas" verb
  job: true,             // job object for cleanup guarantee
  createNoWindow: true,  // DETACHED_PROCESS
});
```

### 6.5 AUMID-based UWP launch

```typescript
await automation.launchApp({
  aumid: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
});
```

Uses `IApplicationActivationManager::ActivateApplication` — the only reliable way to launch UWP apps.

---

## Phase 7 — Mock Backend Fidelity

Estimated: 2 weeks  
Impact: **High** — makes the framework testable without a real desktop.

### 7.1 Tree-aware element lookup

- `findElement`/`findAll` traverse the element tree hierarchy instead of flat-matching all elements in the window.
- Scope containers actually restrict the search subtree.

### 7.2 Dynamic state simulation

```typescript
mock.scheduleEvent(() => mock.addElement({ handle: "btn", name: "OK" }), 500);
// After 500ms, the element appears — waitFor will succeed after a delay
```

- Enables testing `waitForElement` timeout vs. success paths.
- `cancelScheduledEvents()` for cleanup.

### 7.3 Event emission in mock

- MockBackend emits `app:launched`, `element:clicked`, `element:typed`, etc., same as NativeBackend.
- `events` property on MockBackend for assertion: `expect(mock.events.emitted("element:clicked")).toBe(3)`.

### 7.4 classNames filtering

- `findElement`/`findAll` actually filter by `classNames` parameter.
- `enumerateWindows` filters by executable name.

### 7.5 `waitForUiChange` intelligence

- Returns `true` when scheduled events are pending (simulates UI being "busy").
- Returns `true` when elements were added/removed since last call.
- Returns `false` only when truly idle (nothing pending, no changes).

---

## Phase 8 — Testing Infrastructure

Estimated: 2 weeks  
Impact: **High** — reduces test flakiness and improves authoring experience.

### 8.1 Negative matchers

```typescript
await expectElement(el).toBeHidden();
await expectElement(el).toBeDisabled();
await expectElement(el).not.toBeVisible();
await expectElement(el).not.toBeEnabled();
await expectElement(el).not.toHaveFocus();
await expectElement(el).not.toHaveText("foo");
await expectElement(el).not.toHaveValue("bar");
await expectElement(el).not.toExist();
```

### 8.2 Polling assertions

```typescript
await expectElement(el).toEventuallyBeVisible({ timeoutMs: 3000 });
await expectElement(el).toEventuallyHaveText("ready", { timeoutMs: 5000 });
await expectElement(el).toEventuallyBeEnabled({ timeoutMs: 2000 });
```

Uses same `poll` + `waitForUiChange` as locators. Clear timeout error messages with element tree snapshot.

### 8.3 State assertions

```typescript
await expectElement(el).toBeChecked();
await expectElement(el).toBeUnchecked();
await expectElement(el).toBeSelected();
await expectElement(el).toHaveAttribute("className", "myClass");
await expectElement(el).toHaveClassName("myClass");
await expectElement(el).toMatchSelector({ role: "button", name: "OK" });
```

### 8.4 Compound matcher

```typescript
await expectElement(el).toMatch({
  visible: true,
  enabled: true,
  text: /^Hello/,
  role: "button",
  hasFocus: false,
});
```

### 8.5 Window & dialog assertions

```typescript
await expectWindow(win).toBeVisible();
await expectWindow(win).toHaveTitle("My App");
await expectWindow(win).toHaveBounds({ left: 0, top: 0 });
await expectWindow(win).toBeMaximized();
await expectWindow(win).toBeMinimized();
await expectWindow(win).toHaveFocus();
await expectDialog(dlg).toHaveTitle("Save As");
await expectDialog(dlg).toHaveButton("OK");
await expectDialog(dlg).toBeVisible();
```

### 8.6 Suite-level retry

```typescript
describe.flaky(3)("flaky suite", () => {
  // All tests in this block retry up to 3 times
});
```

### 8.7 Element tree snapshots

```typescript
await expect(window.inspectTree(3)).toMatchElementTree();
// On first run, creates a snapshot file.
// On subsequent runs, compares against snapshot.
// Update with --update-snapshots flag.
```

### 8.8 Fixture helpers

```typescript
const { auto, app, window, mock, elements } = createMockFixture({
  windowTitle: "TestApp",
  elements: [
    { handle: "btnOk", name: "OK", role: "button", enabled: true, visible: true },
    { handle: "txtInput", name: "Input", role: "textbox" },
  ],
});
```

---

## Phase 9 — Rust Core Hardening

Estimated: 3 weeks  
Impact: **High** — improves debuggability, performance, and correctness.

### 9.1 Structured error types (Rust)

```rust
#[derive(thiserror::Error)]
enum AutomationError {
    ElementNotFound { handle: String, selector: String },
    ComInitFailed { reason: String },
    PermissionDenied { handle: String, is_uip_barrier: bool },
    PatternNotSupported { handle: String, pattern: &'static str },
    WindowNotFound { pid: u32, timeout_ms: u64 },
    ProcessLaunchFailed { path: String, os_error: i32 },
    ScreenshotFailed { handle: String, reason: String },
    Timeout { operation: &'static str, duration_ms: u64 },
}
```

- Each variant maps to the appropriate napi-rs `Status` code.
- Error messages include structured context (handle, selector, os error code).

### 9.2 Event watcher rewrite

- Listen for multiple WinEvent types: `EVENT_OBJECT_SHOW`, `EVENT_OBJECT_HIDE`, `EVENT_OBJECT_CREATE`, `EVENT_OBJECT_DESTROY`, `EVENT_OBJECT_VALUECHANGE`, `EVENT_SYSTEM_MENUSTART`, `EVENT_SYSTEM_MENUEND`.
- Return event object to JS: `{ type, handle, windowHandle, processId, timestamp }`.
- Proper thread lifecycle via napi-rs `CleanupEnv` hook.

### 9.3 Drag-drop via OLE

- Add `DoDragDrop` / `IDropTarget` integration for OLE-aware apps (Explorer, Office, Outlook).
- Keep mouse-simulation fallback for non-OLE targets.
- `dragDrop(target, { mode: "ole" | "mouse" | "auto" })`.

### 9.4 Process launch via CreateProcessW

- Full `STARTUPINFOEXW` support for env, cwd, extended attributes.
- Job object creation for guaranteed cleanup.
- `stdout`/`stderr` capture via pipe handles.

### 9.5 Parallel template matching

- Split search area into quadrants, search each in parallel via `rayon`.
- Configurable thread count via `WIN_AUTO_MATCH_THREADS`.

---

## Phase 10 — Cross-Cutting & Operations

Estimated: 2 weeks  
Impact: **High** — makes the framework production-ready.

### 10.1 DPI awareness (complete)

- `get_dpi_for_window` already in Rust — apply to all coordinate operations.
- Auto-scale `mouseMove`, `clickAt`, `screenshot`, `getBounds`, `setBounds`.
- `WIN_AUTO_DPI_SCALE` override for CI machines.
- Per-monitor DPI awareness via `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`.

### 10.2 UIPI elevation handling

- Detect elevated target processes via `GetTokenInformation(TokenElevation)`.
- Error message guidance: `"Target is elevated. Use runAs: 'admin' or run: 'win-auto elevate'"`.
- Auto-elevation helper: `win-auto elevate` re-launches the CLI with `runas` verb.
- WM_INPUT workaround for cross-UIPI input when elevation is not feasible.

### 10.3 Environment diagnostics

```typescript
const report = await automation.diagnostics.collect();
// {
//   os: { version: "10.0.22631", edition: "Pro", build: "22631" },
//   displays: [{ width, height, dpi, scale }],
//   uia: { available: true, version: "7.2" },
//   native: { version: "0.1.6", functions: ["ping", "launch", ...] },
//   processes: { total: 120, elevated: 3 },
// }

await automation.diagnostics.export("diagnostics.json");
```

### 10.4 Config expansion

```typescript
// win-auto.config.ts
export default {
  runtime: "native",
  timeoutMs: 10000,
  screenshotOnFailure: true,
  inputMode: "auto",            // "hardware" | "pattern" | "auto"
  dpiScale: 1.0,                // override auto-detection
  retryOnStale: 2,              // stale-element retry count
  debugImages: false,           // save image match debug overlays
  debugLocators: false,         // log locator strategy decisions
  eventLog: ["app:*", "element:clicked"],  // filtered event logging
  pollInterval: "adaptive",     // "adaptive" | number (ms)
  appConfig: [
    {
      match: "legacy.exe",
      inputMode: "hardware",
      classNames: ["Edit", "Button", "ThunderRT6TextBox"],
      dpiMode: "system",       // "system" | "per-monitor" | "unaware"
      timeoutMs: 20000,
    },
  ],
};
```

### 10.5 `win-auto diagnose` CLI command

```
win-auto diagnose [options]

Options:
  --pid <number>     Target process ID
  --name <string>    Target process image name
  --tree             Show UIA element tree
  --hwnd             Show HWND tree
  --uia              Show available UIA patterns per element
  --events           Live event monitor (Ctrl+C to stop)
  --recommend        Show recommended selectors
  -o, --output       Save report to file

Examples:
  win-auto diagnose --pid 1234 --tree
  win-auto diagnose --name notepad --uia --recommend
  win-auto diagnose --pid 5678 --events
```

---

## Implementation order summary

| Step | What | Time | Why first |
|---|---|---|---|
| Q1–Q5 | Quick wins (Q5 ✅ done) | 1–2 wks | Foundation for everything |
| P1 | Foundation hardening | 2 wks | Every layer depends on errors, events, COM |
| P3 | Wait system | 2 wks | Most tests fail due to timing, not logic |
| P2 | Element discovery | 3–4 wks | The core value proposition |
| P9 | Rust hardening | 3 wks | Debuggability and performance |
| P10.2 | UIPI handling | 1 wk | Silent killer in production |
| P4 | Dual input | 3 wks | Expands supported app range |
| P7 | Mock backend | 2 wks | Makes testing possible without desktop |
| P8 | Testing infra | 2 wks | Makes tests reliable and easy to write |
| P5 | Image recognition | 3–4 wks | Last-resort for invisible elements |
| P6 | Legacy toolkit | 3 wks | The differentiator |
| P10 | Cross-cutting | 2 wks | Production polish |

**Total estimated: ~4–6 months for one experienced developer.**
