# win-auto — agents guide

## Repo

Windows desktop automation framework (TypeScript + Rust/napi-rs). Windows 10/11 only.

## Monorepo (npm workspaces)

| package | path | npm name |
|---|---|---|
| Core TS API | `packages/core/` | `@win-auto/core` |
| CLI | `packages/cli/` | `win-auto` |
| Native addon | `native/win-auto-native/` | `win-auto-native` |

## Commands (run from root)

```bash
npm run build          # builds core (CJS+ESM) → cli → native
npm run build:native   # Rust napi-rs build (requires Rust toolchain)
npm run typecheck      # tsc -b --pretty false (project references)
npm run lint           # eslint packages/
npm run format         # prettier --write "packages/**/*.{ts,json,md}"
npm run format:check   # prettier --check "packages/**/*.{ts,json,md}"
npm run clean          # rimraf packages/*/dist
```

## Test commands

```bash
npm run test                  # core unit tests + e2e
npm run test -w @win-auto/core  # core unit tests only
npm run test:e2e              # native-ping e2e test (needs native build)
npm run test:e2e:real         # notepad real UI test (requires desktop)
npm run coverage              # vitest run --coverage
```

## CI pipeline order

`typecheck` → `lint` (continue-on-error) → `unit tests` → `native build` → `e2e tests` → `coverage` (continue-on-error)

E2E tests run in a separate job that downloads the native build artifact.

## Testing quirks

- **vitest globals**: enabled in root `vitest.config.ts` — `describe`/`it`/`expect` are global
- **Custom `it`**: from `packages/core/src/testing/vitest.ts` with `.ci()`, `.realDesktop()`, `.flaky(N)` runners
  - `it.ci()` skips tests locally
  - `it.realDesktop()` skips when `WIN_AUTO_BACKEND=mock`
  - `it.flaky(3)` retries up to 3 times
  - Default timeout: 30s
- **Auto cleanup**: `setup.ts` registers `afterEach` → `closeTrackedApps()`; `onTestFailed` → auto-screenshots
- **Assertion helpers** (from `@win-auto/core/testing`): `expectElement(el).toBeVisible()`, `.toBeEnabled()`, `.toHaveText()`, `.toHaveValue()`
- **`@win-auto/core/testing` subpath exports**: `testing`, `testing/setup`, `testing/globals`
- **Config file**: `win-auto.config.ts` (or `.mjs`/`.cjs`/`.js`) — sets `runtime` (`mock`|`native`) and `timeoutMs`
- **Mock backend**: `new Automation(new MockBackend())` — in-memory simulation, no real desktop needed
- **Test setup file**: `packages/core/src/testing/setup.ts` — loaded globally by root vitest.config.ts

## Build quirks

- Core produces dual output: `dist/` (CJS) + `dist/esm/` (ESM)
- `tsconfig.json` in root has project references (`composite: true`) for all sub-tsconfigs
- Native module loaded at runtime via `packages/core/src/native/loadNative.ts` — searches multiple paths, warns on missing extended functions
- Native build: `napi build --platform --release` (uses napi-rs)

## Architecture

- **`Automation`** is the entry point; optionally takes a `Backend` (default `NativeBackend`)
- **`TestAutomation`** extends `Automation` with auto-tracking via `closeTrackedApps()`
- **`Backend`** interface: `NativeBackend` (real UIA) / `MockBackend` (in-memory)
- **Events**: `automation.events` is an EventEmitter, emits `app:*`, `window:*`, `element:*`, `dialog:*`, etc.

## CLI

```bash
win-auto init <project-name>
win-auto inspect <pid|imageName> [maxDepth] [--hwnd] [--highlight <name>]
win-auto query <pid|imageName> [--name <name>] [--role <role>] [--all] [--highlight]

## Anchored Summary (last updated: 2026-06-12)

### Completed (all sub-items)

| Phase | Description | Evidence |
|---|---|---|
| **P4 (Dual Input)** | enigo hardware (`input-hardware` feature), InputMode dispatching (Pattern/Hardware/Auto) in Rust napi fns, `element.invoke()` via InvokePattern | `interaction.rs`, `hardware_input.rs`, `patterns.rs` |
| **P5 (Image Recognition)** | FFT cross-correlation (`image-fft`), multi-scale pyramid, ROI, OCR via `Windows.Media.Ocr` (`image-ocr`), debug overlay PNGs | `template_match.rs`, `ocr.rs`, `screenshot.rs` |
| **P6 (Legacy App Toolkit)** | DirectUIHWND/CoreWindow detection, `getLegacyInfo()`, WM_COMMAND/WM_SETTEXT/WM_NOTIFY, expanded LaunchOptions, AUMID launch | `dialogs.rs`, `discovery.rs`, `legacy_messages.rs`, `process_control.rs` |
| **P7 (Mock Backend)** | Tree-aware lookup, dynamic state simulation (`scheduleEvent`), event emission, `classNames` filtering, `waitForUiChange` | `mockBackend.ts` |
| **P8 (Testing Infra)** | Negative/polling/state/compound matchers, window/dialog assertions, suite-level retry, tree snapshots, fixture helpers | `testing/matchers.ts`, `vitest.ts`, `treeSnapshot.ts`, `fixture.ts` |
| **P10.3–P10.5** | Diagnostics class, config expansion (`win-auto.config.ts` schema), `win-auto diagnose` CLI command | `diagnostics.ts`, `config.ts`, `cli/diagnose.ts` |
| **P10.1 (DPI wired)** | DPI helpers, `logical_to_physical_system` in mouseMove/clickAt, `physical_to_logical` in findImage results, real DPI in diagnostics | `utils.rs`, `interaction.rs`, `screenshot.rs`, `diagnostics.ts` |
| **P10.2 (UIPI bypass)** | `is_uip_barrier` wired in PermissionDenied errors, auto-retry pattern mode on hardware UIPI failure, `getSystemDpi` napi export | `interaction.rs`, `error.rs`, `types.ts` |
| **P12 (Determinism Layer)** | MockClock virtual time, DeterministicPoll, SessionRecorder/SessionReplayer, waitForUiChange debounce/coalesce/stall detection, `win-auto record`/`replay` CLI, `deterministic` config option | `deterministicWait.ts`, `sessionRecorder.ts`, `sessionReplayer.ts`, `cli/commands/record.ts`, `cli/commands/replay.ts` |

### Partially Complete

| Item | Status | Missing |
|---|---|---|
| **P4.2 remaining UIA patterns** | ✅ Done (AGENTS.md was outdated) | `ExpandCollapsePattern`, `ScrollPattern`, `RangeValuePattern`, `SelectionPattern`, `GridPattern`/`TablePattern`, `WindowPattern` — all implemented |
| **P10.1 DPI coordinate wiring** | ✅ Done | mouseMove/clickAt now use system DPI conversion; findImage returns logical coords; diagnostics reports real DPI via native `getSystemDpi` |
| **P10.2 UIPI elevation** | ✅ Done | `is_uip_barrier` set in PermissionDenied errors; hardware → pattern auto-fallback on UIPI; all SetCursorPos call sites detect UIPI |
| **P12 tree injection in replayer** | ✅ Done | `elementNodeToMockTree()` converts ElementNode→MockTreeElement; `ensureMockProcess()` creates mock process; `injectTreeFrame()` calls `setupElementTree()`; session tree frames populated via tracked PIDs |

### Test Status

- 94 unit tests + 1 e2e test (`native-ping`) pass
- Pre-existing: `loadNative.ts` has 4 `import.meta` typecheck errors (CJS limitation); 2 lint errors (`@ts-ignore`)
- Native `.node` binary builds successfully with `npm run build:native` (8 warnings, 0 errors)

### Relevant Files

- `native/win-auto-native/src/template_match.rs` — P5.1 FFT cross-correlation (`image-fft`)
- `native/win-auto-native/src/ocr.rs` — P5.4 OCR (`findText`) behind `image-ocr`
- `native/win-auto-native/src/screenshot.rs` — ROI, multi-scale, debug overlays
- `native/win-auto-native/src/interaction.rs` — P4.1 InputMode dispatching, mouse/click/hover
- `native/win-auto-native/src/hardware_input.rs` — enigo-based click/type/pressKey
- `native/win-auto-native/src/patterns.rs` — InputMode enum, `invoke_pattern`
- `native/win-auto-native/src/discovery.rs` — `get_window_info`
- `native/win-auto-native/src/legacy_messages.rs` — WM_* message injection
- `native/win-auto-native/src/dialogs.rs` — `detectDialogType`
- `native/win-auto-native/src/process_control.rs` — AUMID launch, elevation, expanded LaunchOptions
- `native/win-auto-native/src/utils.rs` — DPI helper fns
- `packages/core/src/api/types.ts` — InputMode, OcrResult, ImageMatch, FindTextOptions, WindowInfo, DialogInfo, launch options, NativeBindings
- `packages/core/src/api/backend.ts` — Backend interface
- `packages/core/src/api/native-backend.ts` — Native delegates
- `packages/core/src/api/element.ts` — `invoke()`, `click()`/`typeText()` forward inputMode
- `packages/core/src/api/window.ts` — `getLegacyInfo()`, `sendWmCommand()`, `findImage()`
- `packages/core/src/mock/mockBackend.ts` — P4–P8 mock stubs
- `packages/core/src/testing/matchers.ts` — P8 assertion helpers
- `packages/core/src/testing/vitest.ts` — custom `it`/`describe` runners
- `packages/core/src/testing/treeSnapshot.ts` — element tree snapshots
- `packages/core/src/testing/fixture.ts` — `createMockFixture`
- `packages/core/src/diagnostics.ts` — P10.3 diagnostics class
- `packages/core/src/config.ts` — P10.4 config schema, P12 deterministic option
- `packages/cli/src/commands/diagnose.ts` — P10.5 CLI command
- `packages/core/src/api/deterministicWait.ts` — P12 MockClock, DeterministicPoll, DeterministicBackendPoller
- `packages/core/src/api/sessionRecorder.ts` — P12 SessionRecorder, SessionRecord types
- `packages/core/src/api/sessionReplayer.ts` — P12 SessionReplayer, ReplayResult
- `packages/cli/src/commands/record.ts` — P12 `win-auto record` CLI command
- `packages/cli/src/commands/replay.ts` — P12 `win-auto replay` CLI command
```
