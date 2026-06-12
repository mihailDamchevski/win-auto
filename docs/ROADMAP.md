# win-auto — Roadmap

> Building a tank-grade desktop automation framework.
>
> The goal: **legacy and modern apps, automated reliably, without
> fragile hacks.**

---

## ✅ Done

| # | Task | Completed |
|---|---|---|---|
| Q1 | Structured Rust errors (`thiserror` enum + napi Status mapping) | 2026-05-28 |
| Q2 | Typed event payloads (26 payload interfaces, typed `on()`/`once()`/`off()`) | 2026-05-28 |
| Q3 | Missing event emissions wired up | 2026-05-27 |
| Q4 | Bare `catch {}` replaced with type-checked stale recovery | 2026-05-28 |
| Q5 | `classNames`/`executable` filtering in MockBackend | 2026-05-27 |
| P1.1 | TS error hierarchy (`AutomationError` → 7 subclasses) | 2026-05-28 |
| P1.2 | Thread-safe COM init (`ComScope` refcount-based, ~27 call sites) | 2026-05-28 |
| P1.3 | Stale-element recovery v2 (configurable retry, backoff, event emission) | 2026-05-28 |
| P1.4 | Event system hardening (typed `AutomationEventPayload[T]`, `off()`, `removeAllListeners()`) | 2026-05-28 |
| P2.1 | Multi-strategy healing engine (8 strategies, confidence threshold, parallel `waitFor`) | 2026-05-28 |
| P2.2 | LegacyIAccessible pattern (`legacyName`/`legacyRole`/`legacyState` fallback) | 2026-05-28 |
| P2.3 | Win32 `className` as top-level filter + `getClassName()` on Element | 2026-05-28 |
| P2.4 | Structural navigation (`parent()`/`next()`/`previous()`/`ancestor()`/`findRelative()`) | 2026-05-28 |
| P3.1 | Fluent `wait.until()` API (`WaitCondition`, `ElementWait`, `WindowWait`, `WaitBuilder`) | 2026-05-28 |
| P3.2 | Inverse waits (`waitForNotVisible`, `waitForNotEnabled`, `waitForRemoved`, `waitForClosed`) | 2026-05-28 |
| P3.3 | Compound conditions (`.and()`/`.or()` on wait conditions) | 2026-05-28 |
| P3.4 | Adaptive poll intervals (10ms–500ms exponential) | 2026-05-28 |
| P9.1 | Structured Rust errors (`AutomationError` enum, 11 variants, `thiserror`) | 2026-05-28 |
| P9.2 | Event watcher rewrite (multi-WinEvent hooks, ThreadsafeFunction, TS integration) | 2026-05-28 |
| P9.3 | Drag-drop via OLE + mouse-simulation fallback mode | 2026-05-28 |
| P9.4 | Process launch via `CreateProcessW` + job objects + `launchProcess` API | 2026-05-28 |
| P9.5 | Parallel template matching (rayon 4-quadrant NCC search) | 2026-05-28 |

---

## Quick wins ✅ (all complete)

Q1–Q5 have been completed, laying the foundation for structured error handling, typed events, and mock backend fidelity.

---

## Phase 1 ✅ — Foundation Hardening (Chassis)

All P1 items are complete:

- **1.1** — TS error hierarchy `AutomationError` → 7 subclasses with structured properties
- **1.2** — Thread-safe COM init via `ComScope` refcounted `thread_local!`
- **1.3** — Stale-element recovery: configurable retry count, exponential backoff, `element:staleRecovered` event
- **1.4** — Event system hardening: typed payloads, `off()`, `removeAllListeners()`

---

## Phase 2 ✅ — Element Discovery Overhaul (Handling Fragile UIs)

All P2 items are complete:

- **2.1** — Healing engine: 8 auto-generated fallback strategies, confidence threshold, parallel `waitFor`
- **2.2** — LegacyIAccessible pattern (Rust): `legacyName`/`legacyRole`/`legacyState` fallback when standard UIA is empty
- **2.3** — `className` top-level filter + `getClassName()` on Element
- **2.4** — Structural navigation: `parent()`, `next(selector?)`, `previous(selector?)`, `ancestor(selector)`, `findRelative()`

---

## Phase 3 ✅ — Fluent Wait & Timing System

All P3 items are complete:

- **3.1** — `wait.until()` fluent API: `WaitCondition<T>`, `ElementWait`, `WindowWait`, `WaitBuilder`, global singleton
- **3.2** — Inverse waits: `waitForNotVisible`, `waitForNotEnabled`, `waitForRemoved`, `waitForClosed`
- **3.3** — Compound conditions: `.and()`/`.or()` on all wait conditions
- **3.4** — Adaptive poll intervals (10ms → 500ms exponential, opt-in via `.adaptive()` or config)

---

## Phase 4 ✅ — Dual Input Mode

**Status: 4.1 ✅ complete, 4.2 ⏳ partially complete (InvokePattern only)**

Impact: **High** — expands supported app types significantly.

### 4.1 enigo hardware input (Rust) ✅

- `enigo` crate behind `input-hardware` feature.
- InputMode dispatching (Pattern/Hardware/Auto) in Rust napi fns.
- `automation.connectApp({ mode: "background" })` support.
- Implemented in: `interaction.rs`, `hardware_input.rs`, `patterns.rs`.

### 4.2 UIA pattern expansion (Rust) ⏳

**Done:** `InvokePattern` — `element.invoke()` via `invoke_pattern` napi fn.

**Remaining patterns:**

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
- `element.expand()`, `element.collapse()`, `element.scroll(options)`, etc.

---

## Phase 5 ✅ — Image Recognition Overhaul

**Status: All sub-items complete**

Impact: **High** — critical for legacy apps with no programmatic handles.

### 5.1 FFT-based template matching (Rust) ✅

- FFT convolution using `rustfft` crate behind `image-fft` feature.
- `fft_cross_correlate` + spatial refinement in `template_match.rs`.
- Fallback to spatial NCC when feature disabled.
- Implemented in: `template_match.rs`, `screenshot.rs` (`template_match_ncc` dispatcher).

### 5.2 Multi-scale matching ✅

- Template pyramid generation (0.5x–2.0x configurable).
- Best result with scale info returned.
- `FindImageOptions.scales` parameter.

### 5.3 Region-of-interest ✅

```typescript
const match = await window.findImage(template, {
  roi: { x: 100, y: 200, width: 400, height: 300 },
  minConfidence: 0.8,
});
```

### 5.4 OCR integration ✅

- `window.findText("text", { language: "en" })` via `Windows.Media.Ocr` behind `image-ocr` feature.
- Non-Send WinRT types scoped before `.await` for tokio compatibility.
- Returns full text + per-line bounding boxes (from `OcrWord` rects).
- Implemented in: `ocr.rs`, `FindTextOptions`, `OcrResult`, `OcrLine` types.

### 5.5 Image match diagnostics ✅

- `WIN_AUTO_DEBUG_IMAGES=1` saves overlay PNGs to `debug-images/`.
- `ImageMatch.debugOverlay` (PNG buffer), `ImageMatch.scale` returned.
- Implemented in: `screenshot.rs`.

---

## Phase 6 ✅ — Legacy App Toolkit

**Status: All sub-items complete**

Impact: **High** — the differentiating feature for "tank-grade."

### 6.1 DirectUIHWND / modern dialog support ✅

- `detectDialogType` in `dialogs.rs` detects `DirectUIHWND` and `CoreWindow`.
- `Dialog.type: "standard" | "directui" | "uwp"` exposed.

### 6.2 Deep HWND tree inspection ✅

- `Window.getLegacyInfo()` via `get_window_info` native fn.
- Returns `{ className, text, style, exStyle, pid, threadId, isUnicode, parentHwnd, ownerHwnd, dpi }`.
- CLI: `win-auto inspect --hwnd` shows HWND tree.

### 6.3 WM_COMMAND / WM_NOTIFY injection ✅

```typescript
await window.sendWmCommand(controlHandle, commandId);
await window.sendWmSetText(controlHandle, text);
await window.sendWmNotify(controlHandle, notificationCode);
```

- For VB6, MFC, Delphi apps that only respond to Win32 messages.
- Implemented in `legacy_messages.rs`.

### 6.4 Process launch expansion ✅

```typescript
await automation.launchApp({
  executablePath: "legacy.exe",
  args: ["--config", "settings.ini"],
  workingDirectory: "C:\\App\\Data",
  env: { MY_APP_MODE: "test" },
  runAs: "admin",
  job: true,
  createNoWindow: true,
});
```

- `LaunchOptions` expanded with `job`, `create_no_window`, `aumid` fields.

### 6.5 AUMID-based UWP launch ✅

```typescript
await automation.launchApp({
  aumid: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
});
```

- Uses `IApplicationActivationManager::ActivateApplication`.
- Implemented in `process_control.rs::launchAppByAumid`.

---

## Phase 7 ✅ — Mock Backend Fidelity

**Status: All sub-items complete**

Impact: **High** — makes the framework testable without a real desktop.

### 7.1 Tree-aware element lookup ✅

- `traverseTree()` depth-first generator with cycle detection.
- `findInTree()` uses tree traversal for `findElement`/`findAll`.
- `getTreeRoots()` returns window-level roots.
- Scope containers restrict search subtree.

### 7.2 Dynamic state simulation ✅

```typescript
mock.scheduleEvent(() => mock.addElement({ handle: "btn", name: "OK" }), 500);
```

- `scheduleEvent()`, `cancelScheduledEvent()`, `cancelScheduledEvents()`, `hasPendingScheduledEvents()`.
- Elements track mutable state: `isVisible`, `isEnabled`, `isFocused`, `isSelected`, `isToggled`, `toggleState`.
- `markDirty()` signals change for `waitForUiChange`.

### 7.3 Event emission in mock ✅

- `events` property (`MockEventTracker`) with `emit()`, `emitted()`, `all()`, `clear()`.
- Emits: `app:launched`, `app:closed`, `window:closed`, `element:clicked`, `element:rightClicked`, `element:doubleClicked`, `element:hovered`, `element:typed`, `element:selected`, `element:toggled`, `element:focused`, `element:valueChanged`, `mouse:moved`, `dialog:found`, `dialog:buttonClicked`, `dialog:fileSelected`, `process:connected`, `process:killed`, `process:exited`.

### 7.4 classNames filtering ✅

- `classNamesMatch()` case-insensitive filter.
- `setAppConfig({ classNames })` configures filter.
- `findElement`/`findAll` apply filter during tree traversal.
- `enumerateWindows` filters by executable.

### 7.5 `waitForUiChange` intelligence ✅

- Returns `true` if dirty flag or pending scheduled events.
- Waits up to `min(timeoutMs, MOCK_DELAY_MS)` otherwise.
- Used throughout TS API for polling loops.

---

## Phase 8 ✅ — Testing Infrastructure

**Status: All sub-items complete**

Impact: **High** — reduces test flakiness and improves authoring experience.

### 8.1 Negative matchers ✅

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

- `.not` getter on `ElementAssertionsImpl` inverts all checks.

### 8.2 Polling assertions ✅

```typescript
await expectElement(el).toEventuallyBeVisible({ timeoutMs: 3000 });
await expectElement(el).toEventuallyHaveText("ready", { timeoutMs: 5000 });
await expectElement(el).toEventuallyBeEnabled({ timeoutMs: 2000 });
```

- Generic `pollFor()` helper with default 5s timeout, 100ms interval.
- Uses same `poll` + `waitForUiChange` as locators.

### 8.3 State assertions ✅

```typescript
await expectElement(el).toBeChecked();
await expectElement(el).toBeUnchecked();
await expectElement(el).toBeSelected();
await expectElement(el).toHaveAttribute("className", "myClass");
await expectElement(el).toHaveClassName("myClass");
```

### 8.4 Compound matcher ✅

```typescript
await expectElement(el).toMatch({
  visible: true,
  enabled: true,
  text: /^Hello/,
  role: "button",
  hasFocus: false,
});
```

### 8.5 Window & dialog assertions ✅

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

- `expectWindow()` → `WindowAssertionsImpl`
- `expectDialog()` → `DialogAssertionsImpl`
- All support `.not` modifier.

### 8.6 Suite-level retry ✅

```typescript
describe.flaky(3)("flaky suite", () => { ... });
it.flaky(3)("flaky test", () => { ... });
```

- `describe.flaky(retries)` and `it.flaky(retries)` in `vitest.ts`.
- Uses vitest's native `retry` option.

### 8.7 Element tree snapshots ✅

```typescript
await expect(window.inspectTree(3)).toMatchElementTree();
```

- Serializes tree, calls `expect().toMatchSnapshot("element-tree")`.

### 8.8 Fixture helpers ✅

```typescript
const { auto, app, window, mock, elements } = createMockFixture({
  windowTitle: "TestApp",
  elements: [
    { handle: "btnOk", name: "OK", role: "button", enabled: true, visible: true },
    { handle: "txtInput", name: "Input", role: "textbox" },
  ],
});
```

- Returns `{ auto, mock, app, window, elements }` where `elements` is keyed by normalized name.

---

## Phase 9 ✅ — Rust Core Hardening

All P9 items are complete:

- **9.1** — Structured Rust errors: `AutomationError` enum (11 variants, `thiserror`, mapped to napi `Status`)
- **9.2** — Event watcher rewrite: multi-WinEvent hooks, `ThreadsafeFunction` for JS callbacks, `startWinEventWatcher`/`stopWinEventWatcher` exports + TS integration
- **9.3** — Drag-drop via OLE + mouse-simulation fallback (`"ole"`/`"mouse"` mode parameter)
- **9.4** — Process launch via `CreateProcessW` + job objects + `launchProcess` options (args, cwd, env)
- **9.5** — Parallel template matching: `rayon` 4-quadrant NCC search

---

## Phase 10 — Cross-Cutting & Operations

**Status: 10.1 ⏳ (helpers done, wiring missing), 10.2 ⏳ (detection/launch/errors done, UIPI bypass missing), 10.3 ✅, 10.4 ✅, 10.5 ✅**

Impact: **High** — makes the framework production-ready.

### 10.1 DPI awareness ⏳

**Done:**
- Rust helpers in `utils.rs`: `get_dpi_for_window`, `get_dpi_scale`, `logical_to_physical`, `physical_to_logical`.
- `WindowInfo.dpi` exposed per-window via `get_window_info`.
- Config fields: `dpiScale`, `dpiMode` in `win-auto.config.ts`.

**Missing — not wired into coordinate operations:**
- `mouseMove(x, y)` — passes raw coords to `SetCursorPos`
- `clickAt(x, y)` — passes raw coords
- `click_element_with_mode()` — uses `GetWindowRect`/UIA rect center directly
- `right_click_element()`, `double_click_element()`, `hover_element()` — same
- `capture_window_bitmap()` — uses `GetWindowRect` raw coords

### 10.2 UIPI elevation handling ⏳

**Done:**
- `is_process_elevated_rust(pid)` — checks `TOKEN_ELEVATION::TokenIsElevated`.
- `run_elevated_rust()` — `ShellExecuteExW` with `"runas"` verb.
- `LaunchOptions.runAs: "admin"` triggers elevated launch.
- `UIPI_HELP_MESSAGE` in `errors.ts` — guides user to `runAs: "admin"` or `win-auto elevate`.
- `NativeBackend.wrapError()` — detects UIPI errors, appends help message.
- CLI `elevate` command — re-launches with `runas` verb.
- `inspect` command shows elevation status.

**Missing:**
- No UIPI barrier bypass for input synthesis (e.g., `SendInput` with `UIPI` mitigation).
- No automatic pattern-mode fallback on UIPI failure (error suggests it but code doesn't retry).

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

| Step | What | Time | Status |
|---|---|---|---|---|
| Q1–Q5 | Quick wins | 1–2 wks | ✅ Done |
| P1 | Foundation hardening | 2 wks | ✅ Done |
| P2 | Element discovery | 3–4 wks | ✅ Done |
| P3 | Wait system | 2 wks | ✅ Done |
| P4 | Dual input (4.1 + InvokePattern) | 3 wks | ✅ Done |
| P5 | Image recognition | 3–4 wks | ✅ Done |
| P6 | Legacy toolkit | 3 wks | ✅ Done |
| P7 | Mock backend | 2 wks | ✅ Done |
| P8 | Testing infra | 2 wks | ✅ Done |
| P9 | Rust hardening | 3 wks | ✅ Done |
| P10.1 | DPI (helpers only) | — | ⏳ Partial |
| P10.2 | UIPI (detection/launch/errors) | 1 wk | ⏳ Partial |
| P10.3 | Diagnostics | 1 wk | ✅ Done |
| P10.4 | Config expansion | 1 wk | ✅ Done |
| P10.5 | CLI diagnose | 1 wk | ✅ Done |

**Completed: 10 of 15 phases (11 of 15 if counting P10 sub-phases). Remaining: P4.2 remaining patterns, P10.1 DPI wiring, P10.2 UIPI bypass.**
