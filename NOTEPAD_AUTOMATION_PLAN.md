# Notepad Automation Fix Plan

## Goal

Make `tests/e2e/notepad-real.test.ts` reliably detect the newly launched Notepad window and type text into its editor control.

## Constraints

- Keep native layer minimal (no heavy retry/test logic in Rust).
- Keep async orchestration/waits primarily in JS.
- Preserve existing API shape (`Automation -> App -> Window -> Element`).

## Phase 1: Validate Runtime Context (No Code Change)

1. Run real test in a normal interactive desktop shell (not constrained agent shell).
2. Compare behavior:
   - interactive shell vs agent shell.
3. If interactive shell passes and agent fails:
   - classify as environment/session limitation.
   - keep real UI test as local-only and gate in CI.

Exit criteria:
- Known-good execution context identified.

## Phase 2: Add Focused Native Diagnostics

Add a temporary native debug function (or verbose mode) to output:

- launch PID,
- candidate Notepad PIDs,
- windows found by UIA + Win32 paths,
- final selected window handle.

Run one real test and capture output.

Exit criteria:
- Concrete evidence of where discovery drops to empty.

## Phase 3: Harden Window Discovery

Order of resolution:

1. UIA top-level window discovery by PID.
2. Win32 `EnumWindows` by PID.
3. Notepad image-name fallback only when PID mismatch is detected.

Tighten filters:

- keep top-level visible windows only,
- avoid returning unrelated desktop windows,
- dedupe handles.

Exit criteria:
- `getMainWindow()` returns a stable handle in local interactive runs.

## Phase 4: Harden Element Discovery

Use selector-driven logic:

- `automationId` path first,
- `name` next,
- `role=textbox` maps to known text controls and UIA control types.

Fallback strategy:

- controlled fallback only within selected Notepad window subtree,
- avoid global broad fallback unless explicitly enabled.

Exit criteria:
- `findElement({ role: "textbox" })` consistently returns a valid handle.

## Phase 5: Verify End-to-End

Test matrix:

- `npm run test:e2e` (ping baseline)
- `npm run test:e2e:real` in interactive shell
- multiple sequential runs to catch flakiness

Cleanup:

- ensure spawned Notepad instances are closed after test.

Exit criteria:
- real e2e passes repeatedly (at least 3 consecutive local runs).

## Phase 6: Finalize and Document

1. Remove temporary diagnostics.
2. Update docs with:
   - supported execution context,
   - known limitations,
   - how to run real UI tests safely.
3. Keep fallback behavior explicit and minimal.

## Immediate Next Action

Run one controlled real test in an interactive shell and gather discovery diagnostics (PID/HWND/UIA candidates) before further code changes.

