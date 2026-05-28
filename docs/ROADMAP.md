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

## Phase 9 ✅ — Rust Core Hardening

All P9 items are complete:

- **9.1** — Structured Rust errors: `AutomationError` enum (11 variants, `thiserror`, mapped to napi `Status`)
- **9.2** — Event watcher rewrite: multi-WinEvent hooks, `ThreadsafeFunction` for JS callbacks, `startWinEventWatcher`/`stopWinEventWatcher` exports + TS integration
- **9.3** — Drag-drop via OLE + mouse-simulation fallback (`"ole"`/`"mouse"` mode parameter)
- **9.4** — Process launch via `CreateProcessW` + job objects + `launchProcess` options (args, cwd, env)
- **9.5** — Parallel template matching: `rayon` 4-quadrant NCC search

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

| Step | What | Time | Status |
|---|---|---|---|---|
| Q1–Q5 | Quick wins | 1–2 wks | ✅ Done |
| P1 | Foundation hardening | 2 wks | ✅ Done |
| P3 | Wait system | 2 wks | ✅ Done |
| P2 | Element discovery | 3–4 wks | ✅ Done |
| P9 | Rust hardening | 3 wks | ✅ Done |
| P10.2 | UIPI handling | 1 wk | ⏳ Pending |
| P4 | Dual input | 3 wks | ⏳ Pending |
| P7 | Mock backend | 2 wks | ⏳ Pending |
| P8 | Testing infra | 2 wks | ⏳ Pending |
| P5 | Image recognition | 3–4 wks | ⏳ Pending |
| P6 | Legacy toolkit | 3 wks | ⏳ Pending |
| P10 | Cross-cutting | 2 wks | ⏳ Pending |

**Completed: 5 of 12 phases. Estimated remaining: ~3–4 months for one experienced developer.**
