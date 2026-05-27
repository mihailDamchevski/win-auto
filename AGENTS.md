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
```
