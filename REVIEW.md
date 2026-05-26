# win-auto Framework Review & Improvement Plan

## Architecture Issues

### ✅ 1. Global mutable config (HIGH PRIORITY — DONE)
`setAppConfig()` sets a global `Mutex<Option<AppConfig>>` in Rust (`config.rs`). Automating two different apps leaks class names between them. Config should be per-instance or passed with each call.

**Fix**: Removed `Mutex<Option<AppConfig>>` from `config.rs`. Config is now passed per-call from TypeScript. `set_app_config` kept as no-op for backward compat. `launch`, `enumerateWindows`, `discover_windows_for_pid` all accept optional executable/classNames params. Removed `get_config()` fallback from `find_element`/`find_all`.

### 2. Error handling is too loose
Many native functions do `let _ = fallible_call()` and silently continue. UIA failures fall back to Win32 without warning. Need a "strict mode" and/or logged warnings on fallback.

### 3. Element identity is handle-fragile
`Element` is identified by HWND handle alone. If an element is destroyed and recreated (common in dynamic UIs), the handle changes. Should combine handle + selector hash for stable identity.

## Performance

### ✅ 4. UIA tree enumeration is O(n) on every call (DONE)
`FindAll(TrueCondition)` gets ALL descendants, then filters manually. UIA supports native property conditions (`FindFirst`/`FindAll` with `PropertyCondition`) which are O(log n). Not used consistently.

**Fix**: Added `try_build_uia_condition()` helper that creates native `PropertyConditionEx` (substring/exact). Added `combine_and_conditions()` for AND-chaining via `CreateAndCondition`. Updated `find_element_uia_by_conditions` to use `FindFirst` with composite conditions (fast path), falling back to `FindAll(TrueCondition)` for regex. Updated `find_all` same pattern. `find_element_name` and `find_and_invoke_by_name` already used property conditions.

### 5. No element caching
Every `findElement` rescans the entire UI tree. For polling in `waitForElement`, this is expensive. An event-driven approach (subscribe to UIA `StructureChanged` / `AutomationFocusChanged` events) would be far more efficient.

## Developer Experience

### ✅ 6. HWND tree inspector (DONE)
`inspectWindowTree` is UIA-only. For debugging legacy apps, need `inspectHwndTree()` showing class names, window text, styles, and HWND hierarchy.

**Fix**: Added Rust `inspect_hwnd_tree()` function — walks raw HWND hierarchy showing class names, window text, visibility. Added `HwndNode` type to TypeScript. Added `inspectHwndTree` to Backend interface, NativeBackend, MockBackend, Window class. Updated CLI `inspect` command with `--hwnd` flag.

### 7. No element preview
The `inspect` CLI command shows a tree but doesn't highlight elements on screen. A visual highlighter (colored border overlay) would make selector debugging 10x faster.

### ✅ 8. Better error messages (DONE)
`"Element not found"` with no context. Should include: what selector was used, top 5 available elements (name/role/className), and how long was waited.

**Fix**: Created `errors.ts` with `buildElementNotFoundError()` — shows selector, window handle, and available element tree on timeout. Updated `waitForElement`/`waitForVisible`/`waitForEnabled`/`locator.waitFor()`/`app.waitForMainWindow()` to use rich errors.

## Testing

### ✅ 9. Mock backend too simple (DONE)
Supports one flat list of elements per window. Real UIA trees are deeply nested. Needs:
- Parent/child/grandchild hierarchies
- Multiple elements with same role/name (for `.nth()` testing)
- Dynamic element creation/destruction (for `waitForElement` testing)

**Fix**: Added `MockBackend.setupElementTree(pid, tree)` for nested hierarchies. Added `addChildElement()`, `addWindow()` for multi-window tests. Added `MockTreeElement` type. Fixed `inspectWindowTree` to traverse actual childHandles tree.

### 10. No stress/volume tests
What happens with 10,000 elements (large data grid)? UIA tree enumeration is synchronous and could block the event loop.

## Missing Features

### 11. No selector playground/REPL
No way to test selectors interactively without re-running entire tests.

### 12. No cross-process element identity
No mechanism to re-identify elements after app restart (e.g., stable selector path).

### 13. No relative/structural selectors
Can't express "find textbox inside groupbox labeled 'Address'". `locatorWithin()` exists in `Locator` but not exposed at `Window` level conveniently.

## Rust Code Quality

### 14. Unsafe blocks lack safety invariants
Several `unsafe` blocks have incomplete safety comments. `SendMessageW`, `CoCreateInstance`, raw pointer dereferences in `EnumWindows` callbacks are hard to audit.

### 15. `windows` crate pinned at 0.58
Latest is 0.60+. Not urgent but should keep current.

## Implementation Priority

| # | Item | Effort | Impact | Area | Status |
|---|---|---|---|---|---|---|
| 1 | **Per-instance config** | 2 days | High | Architecture | ✅ Done |
| 2 | **Better error messages** | 1 day | High | DX | ✅ Done |
| 3 | **Real element tree in mock** | 3 days | High | Testing | ✅ Done |
| 4 | **HWND tree inspector** | 1 day | Medium | DX | ✅ Done |
| 5 | **Native UIA property conditions** | 2 days | Medium | Performance | ✅ Done |
| 6 | **Element highlighter** | 2 days | Low | DX | ⏳ Pending |
| 7 | **Event-driven element watching** | 5 days | Medium | Performance | ⏳ Pending |
| 8 | **Selector playground** | 3 days | Medium | DX | ⏳ Pending |
