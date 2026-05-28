# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Structured Rust errors** (`AutomationError` enum, 11 variants, `thiserror`, napi `Status` mapping)
- **TS error hierarchy** (`AutomationError` base → 7 subclasses with structured properties)
- **Typed event payloads** (26 typed payload interfaces, typed `on()`/`once()`/`off()` overloads)
- **Thread-safe COM init** (`ComScope` refcount-based `thread_local!` replacing per-function `ComGuard`)
- **Stale-element recovery v2** (configurable retry count, exponential backoff, `element:staleRecovered` event)
- **Event system hardening** (`AutomationEventPayload[T]` mapped type, `off()`, `removeAllListeners()`)
- **Multi-strategy healing engine** (`Locator.heal()` with 8 auto-generated fallback strategies, confidence threshold, parallel `waitFor`)
- **LegacyIAccessible pattern** (`legacyName`/`legacyRole`/`legacyState` fallback when standard UIA is empty)
- **Win32 `className` support** — top-level filter + `getClassName()` on Element
- **Structural navigation** (`parent()`, `next(selector?)`, `previous(selector?)`, `ancestor(selector)`, `findRelative()`)
- **Fluent wait API** (`wait.until()`, `WaitCondition<T>`, `ElementWait`, `WindowWait`, `WaitBuilder`, global singleton)
- **Inverse waits** (`waitForNotVisible`, `waitForNotEnabled`, `waitForRemoved`, `waitForClosed`)
- **Compound conditions** (`.and()`/`.or()` on all wait conditions)
- **Adaptive poll intervals** (10ms → 500ms exponential, opt-in via `.adaptive()` or config)
- **WinEvent event watcher** (7 event types, `ThreadsafeFunction` JS callbacks, `startWinEventWatcher`/`stopWinEventWatcher`)
- **OLE drag-drop with mode fallback** (`"ole"` mode detects OLE support, `"mouse"` mode pure simulation)
- **Process launch via `CreateProcessW`** + job objects + `launchProcess` options (args, cwd, env)
- **Parallel template matching** (`rayon` 4-quadrant NCC search for `findImage`)

### Changed

- `dragDrop()` now auto-detects OLE support and falls back to mouse simulation
- `launch()` uses native `CreateProcessW` instead of `std::process::Command`
- All Element action methods (`click`, `typeText`, etc.) use `retryOnStale()` helper with configurable backoff
- COM initialization uses refcount-based `ComScope` instead of per-function `ComGuard`

### Fixed

- Bare `catch {}` in stale-element recovery now only retries on appropriate error types
- `catch {}` in `tryResolve()` intentionally preserved (separate from action retry)

### Changed

### Fixed

### Removed

## [0.1.0] - 2026-05-19

### Added

- Initial skeleton release

[Unreleased]: https://github.com/mihailDamchevski/win-auto/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mihailDamchevski/win-auto/releases/tag/v0.1.0
