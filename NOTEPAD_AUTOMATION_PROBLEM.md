# Notepad Automation Problem Log

## Summary

Real Notepad e2e (`tests/e2e/notepad-real.test.ts`) is failing with:

- `No top-level window found for launched process.`

This happens even though `notepad.exe` is launched successfully and visible at process level.

## What Works

- `npm run build` passes.
- `npm run build:native` passes (Rust addon compiles and loads).
- `npm run test:e2e` passes (`ping()` integration).
- Notepad process launch works and can be terminated after tests.

## What Fails

- `npm run test:e2e:real` fails intermittently or consistently with no window found.
- `app.getMainWindow()` keeps returning `null`.

## Current Technical State

- Native layer is Rust + `napi-rs`.
- `launch(executablePath)` returns a PID.
- `enumerateWindows(processId)` tries:
  1. UIA-first top-level discovery.
  2. Win32 `EnumWindows` PID-scoped fallback.
  3. top-level Notepad fallback path.
- `findElement(windowHandle, ...)` uses:
  - UIA handle touch/validation,
  - child class scan (`Edit`, `RichEditD2DPT`, `Scintilla`),
  - global Notepad scan fallback.

## Key Observations So Far

1. Launch success does not imply HWND visibility in this runtime.
2. New Notepad (Windows 11 variants) can behave differently from classic HWND assumptions.
3. PID handoff behavior can occur (`launch` PID and UI-host PID may differ).
4. In this agent execution environment, UI visibility/enumeration appears constrained.
5. Same code may behave differently in an interactive local desktop shell.

## Likely Root Causes

- Desktop/session isolation between test process and launched UI process.
- HWND filters too strict for modern Notepad hosting model.
- UIA event/provider instability in constrained runtime.
- Timing/race around process launch -> window ready transition.

## Reproduction

From repo root:

```powershell
npm run build:native
npm run test:e2e:real
```

Typical failure:

```text
No top-level window found for launched process.
```

## Non-Code Signals That Matter

- If this fails in agent/automation terminal but works in interactive terminal, this is environment-bound.
- If both fail, issue is code+strategy (window discovery/selector model) and needs deeper diagnostics.

## Diagnostic Data To Collect Next

For each run, capture:

- PID returned by `launch`.
- Set of Notepad PIDs before/after launch.
- Enumerated HWND list with:
  - HWND value
  - owning PID
  - class name
  - visibility
  - owner/parent relation
- UIA discovered top-level elements for matching PID and their native handles.

