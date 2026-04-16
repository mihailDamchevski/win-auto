# win-auto-native Documentation

## Overview

`win-auto-native` is a Rust library that provides Windows automation capabilities through Node.js N-API bindings. It enables programmatic control of Windows applications, by leveraging Windows UI Automation (UIA) APIs and low-level window manipulation.

## Architecture

The library is built as a C-compatible dynamic library (`cdylib`) that exposes async Rust functions to Node.js through the NAPI interface. It uses the `windows` crate to access low-level Windows APIs.

### Key Dependencies

- **napi** (v2): Node-API bindings for Rust → Node.js interoperability
- **napi-derive** (v2): Procedural macros for simplified NAPI binding definition
- **windows** (v0.58): Safe bindings to Windows APIs including:
  - COM (Component Object Model)
  - UI Accessibility (UIAutomation)
  - Threading and process management
  - Window enumeration and messaging

## Core Components

### Utility Functions

#### Error Handling

```rust
fn napi_error(message: impl Into<String>) -> Error
```

Creates an NAPI error with a generic failure status for propagation to Node.js.

#### Handle Conversion

```rust
fn parse_hwnd(handle: &str) -> Result<HWND>
fn hwnd_to_string(hwnd: HWND) -> String
fn to_wide_null_terminated(value: &str) -> Vec<u16>
```

Converts between string representations of window handles and Windows `HWND` types, and encodes strings to wide (UTF-16) null-terminated format required by Windows APIs.

#### Window Information Retrieval

```rust
fn get_class_name(hwnd: HWND) -> String
```

Safely retrieves the class name of a window handle.

#### Process and Window Enumeration

```rust
fn window_process_ends_with(hwnd: HWND, file_name: &str) -> bool
fn pids_by_image(image_name: &str) -> Vec<u32>
fn collect_windows_for_pid(process_id: u32) -> Vec<HWND>
```

- `window_process_ends_with`: Checks if a window's owning process matches a filename
- `pids_by_image`: Gets all process IDs for a given executable using `tasklist` command
- `collect_windows_for_pid`: Enumerates all windows belonging to a specific process

#### UIAutomation Integration

```rust
fn uia_windows_for_pid(process_id: u32) -> Result<Vec<HWND>>
fn is_top_level_visible(hwnd: HWND) -> bool
fn find_notepad_edit_hwnd(window_hwnd: HWND) -> Option<HWND>
fn create_uia() -> Result<IUIAutomation>
```

- `uia_windows_for_pid`: Uses Windows UIAutomation to discover windows for a process
- `is_top_level_visible`: Checks if a window is top-level and visible
- `find_notepad_edit_hwnd`: Recursively searches for edit controls (Edit, RichEditD2DPT, or Scintilla)
- `create_uia`: Initializes the UIAutomation COM object

### Exported NAPI Functions

#### `ping() -> String`

**Purpose**: Health check function.
**Returns**: "ok"
**Usage**: Verifies that the native module is loaded and functional.

---

#### `launch(executable_path: String) -> Promise<number>`

**Purpose**: Launches a Windows executable and returns its process ID.

**Parameters**:

- `executable_path`: Full path to the executable to launch

**Returns**: Process ID (u32) of the launched process

**Special Handling for Notepad**:

- Records process IDs before launch
- Waits up to 10 seconds for Notepad to create a visible top-level window
- If the spawned process creates no window, checks for new Notepad instances
- Returns the PID of the first process with a visible window (up to 100 attempts)

**Errors**: Fails if process cannot be spawned

---

#### `enumerateWindows(processId: number) -> Promise<string[]>`

**Purpose**: Discovers all top-level visible windows belonging to a process.

**Parameters**:

- `processId`: Process ID to query

**Returns**: Array of window handles as strings

**Discovery Strategy** (in order):

1. **UIAutomation Discovery**: Queries via Windows UIAutomation for reliability with modern applications
2. **Direct Enumeration**: Uses Win32 EnumWindows with process filtering
3. **Fallback**: For Notepad PID handoff scenarios, searches all Notepad windows

**Note**: Handles edge cases where Notepad might be launched but not immediately visible.

---

#### `findElement(windowHandle: string, automationId?: string, name?: string, role?: string) -> Promise<string | null>`

**Purpose**: Locates an interactive element (edit control) within a window.

**Parameters**:

- `windowHandle`: Handle of the window to search (as string)
- `automationId`: _Currently unused_
- `name`: _Currently unused_
- `role`: _Currently unused_

**Returns**: Window handle of the edit control, or null if not found

**Search Algorithm**:

1. Validates the window handle and initializes COM/UIAutomation
2. Searches the specified window for edit controls:
   - Edit (standard Windows text control)
   - RichEditD2DPT (rich text editor control)
   - Scintilla (advanced editor control, Windows 11 Notepad)
3. **Fallback**: If not found in the specified window, searches all Notepad instances
4. **Final Fallback**: Returns the original window handle

**Use Case**: Primarily designed for Notepad automation; can type into discovered edit controls.

---

#### `typeText(elementHandle: string, text: string) -> Promise<void>`

**Purpose**: Sets text content of a window element.

**Parameters**:

- `elementHandle`: Window handle of the target element (as string)
- `text`: Text to set

**Returns**: Promise that resolves when complete

**Implementation**:

- Converts text to UTF-16 null-terminated format
- Sends `WM_SETTEXT` message to the window
- Unsafe due to raw pointer manipulation and Windows message passing

**Note**: This is a direct window message approach; updates happen synchronously at the Windows level.

---

## Usage Pattern

```typescript
// 1. Launch Notepad
const pid = await launch("C:\\Windows\\System32\\notepad.exe");

// 2. Enumerate windows for the process
const windowHandles = await enumerateWindows(pid);

// 3. Find the text edit control
const editHandle = await findElement(windowHandles[0]);

// 4. Type text into the edit control
await typeText(editHandle, "Hello, World!");
```

## Safety Considerations

### Unsafe Code

The library extensively uses unsafe code to interact with Windows APIs:

- **Window enumeration callbacks**: Raw pointer dereferencing for callback contexts
- **COM initialization**: Apartment-threaded model for concurrent access
- **Message passing**: Direct pointer casting and window message sending
- **Process handle management**: Manual handle closing after process queries

### Error Handling

- Gracefully handles invalid handles and COM errors
- Returns empty results rather than panicking on failed API calls
- Validates string UTF-16 conversions with lossy decoding fallback

## Performance Notes

- **UIAutomation**: May incur slight overhead on first call (COM initialization)
- **Process enumeration**: Uses `tasklist` command (synchronous subprocess)
- **Window search**: Recursive traversal; stops at first match
- **Async wrapping**: All NAPI functions are async to prevent blocking the Node.js event loop

## Platform Requirements

- **Windows only**: All APIs are Windows-specific
- **Windows version**: Requires Windows 7+ (most APIs available since Vista)
- **Node.js**: Compatible with N-API v2 (Node.js 11.6+)

## Limitations & Known Issues

1. **Unused Parameters**: `findElement` accepts but ignores `automationId`, `name`, and `role`
2. **Notepad-Specific**: Optimized for Notepad; other applications may require additional discovery logic
3. **Edit Control Detection**: Only searches for specific control class names (Edit, RichEditD2DPT, Scintilla)
4. **No Window Focus**: Does not attempt to focus windows before typing; relies on message-level injection
5. **Synchronous Typing**: Text is set directly without character-by-character simulation

## Build Information

```toml
[package]
name = "win_auto_native"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]
```

The library is compiled as a C-compatible dynamic library for Node.js N-API consumption.

### Build Script

The `build.rs` file runs `napi-build::setup()` to configure the build environment for proper NAPI integration.

## Future Enhancement Opportunities

- Support for additional control types and UI frameworks
- Respect for `automationId`, `name`, and `role` parameters in element search
- Focus and activation logic before text input
- Keyboard simulation with key press timing
- Support for more Windows applications beyond Notepad
