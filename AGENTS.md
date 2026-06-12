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

### Completed

- **P6 (Legacy App Toolkit)**: All 5 sub-items implemented and verified.
  - P6.1 — DirectUIHWND/CoreWindow detection in `dialogs.rs::detectDialogType`; `Dialog.type` property (`"standard"|"directui"|"uwp"`)
  - P6.2 — `Window.getLegacyInfo()` via `get_window_info` native fn (className, text, style, pid, threadId, dpi, etc.)
  - P6.3 — `sendWmCommand`/`sendWmSetText`/`sendWmNotify` native fns in `legacy_messages.rs`
  - P6.4 — `LaunchOptions` expanded with `job`, `create_no_window`, `aumid` fields in Rust struct + TS types
  - P6.5 — AUMID launch via `IApplicationActivationManager::ActivateApplication` in `process_control.rs::launchAppByAumid`

### Test Status

- 95 unit tests + 1 e2e test (`native-ping`) pass
- Pre-existing: `loadNative.ts` has 4 `import.meta` typecheck errors (CJS limitation); 3 lint errors (`@ts-ignore`, `require()`)
- Native `.node` binary builds successfully with `npm run build:native` (8 warnings, 0 errors)

### Relevant Files

- `native/win-auto-native/src/discovery.rs` — `get_window_info`
- `native/win-auto-native/src/legacy_messages.rs` — WM_* message injection
- `native/win-auto-native/src/dialogs.rs` — `detectDialogType`, dialog_type field
- `native/win-auto-native/src/process_control.rs` — `launchAppByAumid`, expanded `LaunchOptions`
- `packages/core/src/api/window.ts` — `getLegacyInfo()`, `sendWmCommand()`, `sendWmSetText()`, `sendWmNotify()`
- `packages/core/src/api/dialog.ts` — `type: DialogType`
- `packages/core/src/api/types.ts` — `WindowInfo`, expanded `DialogInfo`, expanded `LaunchOptions`, expanded `NativeBindings`
- `packages/core/src/api/backend.ts` — P6 methods on `Backend` interface
- `packages/core/src/api/native-backend.ts` — P6 implementations delegating to native
- `packages/core/src/mock/mockBackend.ts` — P6 mock stubs
```
