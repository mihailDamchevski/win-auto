//! # win-auto-native
//!
//! A Windows automation library for Node.js that provides programmatic control of Windows applications
//! through N-API bindings. This library enables automation of any Windows GUI application by
//! configuring the target executable and window class names for interactive elements.
//!
//! ## Features
//!
//! - **Application Configuration**: Set up automation for any Windows application
//! - **Process Management**: Launch applications and manage their processes
//! - **Window Enumeration**: Discover and interact with application windows
//! - **Element Finding**: Locate interactive UI elements within windows
//! - **Text Input**: Send text input to UI controls
//! - **Mouse Interactions**: Click, hover, drag and drop operations
//! - **Scrolling**: Vertical and horizontal scrolling support
//!
//! ## Basic Usage
//!
//! ```javascript
//! const { setAppConfig, launch, enumerateWindows, findElement, typeText, hoverElement, scrollElement, dragDrop } = require('win-auto-native');
//!
//! // Configure for Notepad
//! setAppConfig('C:\\Windows\\System32\\notepad.exe', ['Edit', 'RichEditD2DPT']);
//!
//! // Launch the application
//! const pid = await launch();
//!
//! // Get windows for the process
//! const windows = await enumerateWindows(pid);
//!
//! // Find an editable element in the main window
//! const element = await findElement(windows[0]);
//!
//! // Type some text
//! await typeText(element, 'Hello, World!');
//!
//! // Hover over an element
//! await hoverElement(element);
//!
//! // Scroll down
//! await scrollElement(element, 'down', 3);
//!
//! // Drag and drop between elements
//! const sourceElement = await findElement(windowHandle, ['SourceClass']);
//! const targetElement = await findElement(windowHandle, ['TargetClass']);
//! await dragDrop(sourceElement, targetElement);
//!
//! // Capture a screenshot
//! const screenshot = await captureScreenshot(element);
//! // Or save to a file
//! await captureScreenshotToFile(element, 'screenshot.bmp');
//! ```
//! ## Testing
//!
//! To test the native module:
//!
//! 1. Build the module: `npm run build:native`
//! 2. Create a test script (see examples below)
//! 3. Run with Node.js: `node test.js`
//!
//! ### Example Test Script
//!
//! ```javascript
//! const native = require('./win-auto-native.win32-x64-msvc.node');
//!
//! // Test ping
//! console.log('Ping:', native.ping()); // Should print "ok"
//!
//! // Configure for Notepad
//! native.setAppConfig('C:\\Windows\\System32\\notepad.exe', ['Edit']);
//!
//! // Launch (uses config)
//! const pid = await native.launch();
//! console.log('Launched PID:', pid);
//!
//! // Get windows
//! const windows = await native.enumerateWindows(pid);
//! console.log('Windows:', windows);
//!
//! if (windows.length > 0) {
//!   // Find element (uses config class names)
//!   const element = await native.findElement(windows[0]);
//!   console.log('Element:', element);
//!
//!   // Type text
//!   await native.typeText(element, 'Test automation works!');
//! }
//! ```
//!
//! ### Finding Window Class Names
//!
//! Use tools like Spy++ (Visual Studio) or WinSpy to identify window class names:
//!
//! - Press Ctrl+Shift+F10 in Spy++ to select a window
//! - Look for "Class" in the properties
//! - Common classes: Edit, Button, Static, RichEditD2DPT, etc.

use napi::{Error, Result, Status};
use napi_derive::napi;
use std::process::Command;
use std::ptr::null_mut;
use std::sync::Mutex;
use std::time::Duration;
use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::System::Threading::{
  GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
  PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};
use windows::Win32::Graphics::Gdi::{
  BitBlt, BI_RGB, BITMAPFILEHEADER, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap,
  CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetWindowDC, ReleaseDC, RGBQUAD,
  SelectObject, SRCCOPY, DIB_RGB_COLORS,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, COINIT_APARTMENTTHREADED, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, TreeScope_Children};
use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEINPUT};
use windows::Win32::UI::WindowsAndMessaging::{
  EnumWindows, FindWindowExW, GetClassNameW, GetWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
  GetWindowThreadProcessId, IsWindowVisible, PostMessageW, SendMessageW, SetCursorPos, GW_OWNER, WM_CLOSE,
  WM_HSCROLL, WM_SETTEXT, WM_VSCROLL,
};

const STILL_ACTIVE: u32 = 259;

#[derive(Clone)]
struct AppConfig {
    executable: String,
    class_names: Vec<String>,
}

static CONFIG: Mutex<Option<AppConfig>> = Mutex::new(None);

/// Creates an NAPI error with a generic failure status.
///
/// # Arguments
/// * `message` - Error message to include in the NAPI error
///
/// # Returns
/// An `Error` object suitable for propagation to Node.js
fn napi_error(message: impl Into<String>) -> Error {
  Error::new(Status::GenericFailure, message.into())
}

/// Converts a string handle representation to a Windows HWND.
///
/// # Arguments
/// * `handle` - String representation of the window handle (as an isize)
///
/// # Returns
/// A `Result` containing the HWND or an error if parsing fails
fn parse_hwnd(handle: &str) -> Result<HWND> {
  let value = handle
    .parse::<isize>()
    .map_err(|_| napi_error(format!("Invalid window/element handle: {handle}")))?;
  Ok(HWND(value as *mut core::ffi::c_void))
}

/// Converts a Windows HWND to its string representation.
///
/// # Arguments
/// * `hwnd` - The window handle to convert
///
/// # Returns
/// A string representation of the handle as an isize
fn hwnd_to_string(hwnd: HWND) -> String {
  format!("{}", hwnd.0 as isize)
}

/// Encodes a string to UTF-16 wide character format with null terminator.
///
/// Required for passing strings to Windows APIs that expect wide null-terminated strings.
///
/// # Arguments
/// * `value` - The string to encode
///
/// # Returns
/// A `Vec<u16>` containing the UTF-16 encoded string with trailing null terminator
fn to_wide_null_terminated(value: &str) -> Vec<u16> {
  value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Retrieves the class name of a window.
///
/// # Arguments
/// * `hwnd` - The window handle
///
/// # Returns
/// The class name as a String, or empty string if retrieval fails
fn get_class_name(hwnd: HWND) -> String {
  unsafe {
    let mut buffer = vec![0u16; 256];
    let copied = GetClassNameW(hwnd, &mut buffer);
    if copied <= 0 {
      return String::new();
    }
    String::from_utf16_lossy(&buffer[..copied as usize]).to_string()
  }
}

fn get_window_title(hwnd: HWND) -> String {
  unsafe {
    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
      return String::new();
    }
    let mut buffer = vec![0u16; (length + 1) as usize];
    let copied = GetWindowTextW(hwnd, &mut buffer);
    if copied <= 0 {
      return String::new();
    }
    String::from_utf16_lossy(&buffer[..copied as usize])
  }
}

fn window_pid(hwnd: HWND) -> u32 {
  let mut pid = 0u32;
  unsafe {
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
  }
  pid
}

fn process_image_for_pid(pid: u32) -> String {
  if pid == 0 {
    return String::new();
  }
  let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
  let Ok(handle) = process else {
    return String::new();
  };
  let mut buffer = vec![0u16; 1024];
  let mut size = buffer.len() as u32;
  let query = unsafe {
    QueryFullProcessImageNameW(
      handle,
      PROCESS_NAME_WIN32,
      windows::core::PWSTR(buffer.as_mut_ptr()),
      &mut size,
    )
  };
  let _ = unsafe { CloseHandle(handle) };
  if query.is_err() || size == 0 {
    return String::new();
  }
  String::from_utf16_lossy(&buffer[..size as usize])
}

fn window_process_ends_with(hwnd: HWND, image_suffix: &str) -> bool {
  let pid = window_pid(hwnd);
  if pid == 0 {
    return false;
  }
  let path = process_image_for_pid(pid).to_ascii_lowercase();
  path.ends_with(&image_suffix.to_ascii_lowercase())
}

fn configured_executable_image_suffix() -> Option<String> {
  let config = CONFIG.lock().unwrap();
  let executable = config.as_ref()?.executable.clone();
  let name = std::path::Path::new(&executable)
    .file_name()?
    .to_string_lossy()
    .to_string();
  Some(name.to_ascii_lowercase())
}

struct AllWindowsContext {
  windows: Vec<HWND>,
}

unsafe extern "system" fn enum_all_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
  let context_ptr = lparam.0 as *mut AllWindowsContext;
  if context_ptr.is_null() {
    return BOOL(0);
  }
  let context = &mut *context_ptr;
  context.windows.push(hwnd);
  BOOL(1)
}

fn collect_all_top_level_windows() -> Vec<HWND> {
  let mut context = AllWindowsContext { windows: Vec::new() };
  unsafe {
    let _ = EnumWindows(
      Some(enum_all_windows_proc),
      LPARAM((&mut context as *mut AllWindowsContext) as isize),
    );
  }
  context.windows
}

fn dedupe_hwnds(handles: Vec<HWND>) -> Vec<HWND> {
  let mut unique = Vec::<HWND>::new();
  for hwnd in handles {
    if !unique.iter().any(|existing| existing.0 == hwnd.0) {
      unique.push(hwnd);
    }
  }
  unique
}

fn is_visible(hwnd: HWND) -> bool {
  unsafe { IsWindowVisible(hwnd).as_bool() }
}

fn hwnd_priority(class_name: &str) -> i32 {
  if class_name.eq_ignore_ascii_case("Notepad") {
    return 0;
  }
  if class_name.eq_ignore_ascii_case("ApplicationFrameWindow") {
    return 1;
  }
  2
}

fn sort_windows_for_selection(handles: &[HWND]) -> Vec<HWND> {
  let mut sorted = handles.to_vec();
  sorted.sort_by_key(|hwnd| {
    let class_name = get_class_name(*hwnd);
    (hwnd_priority(&class_name), class_name)
  });
  sorted
}

/// Recursively searches for edit control windows with specified class names.
///
/// # Arguments
/// * `window_hwnd` - The parent window to search within
/// * `classes` - List of class names to search for
///
/// # Returns
/// `Some(HWND)` if an element with matching class is found, `None` otherwise
fn class_name_matches(class_name: &str, configured: &str) -> bool {
  if class_name.eq_ignore_ascii_case(configured) {
    return true;
  }
  let class_lower = class_name.to_ascii_lowercase();
  let configured_lower = configured.to_ascii_lowercase();
  if configured_lower == "edit" && (class_lower.contains("edit") || class_lower.contains("document")) {
    return true;
  }
  if configured_lower.contains("richedit") && class_lower.contains("richedit") {
    return true;
  }
  false
}

fn find_element_hwnd(window_hwnd: HWND, classes: &[String]) -> Option<HWND> {
  fn recurse_children(parent: HWND, classes: &[String]) -> Option<HWND> {
    unsafe {
      let mut child = FindWindowExW(parent, HWND(null_mut()), None, None).ok();
      while let Some(current) = child {
        if current.is_invalid() {
          break;
        }
        let class_name = get_class_name(current);
        if classes.iter().any(|c| class_name_matches(&class_name, c)) {
          return Some(current);
        }
        if let Some(found_nested) = recurse_children(current, classes) {
          return Some(found_nested);
        }
        child = FindWindowExW(parent, current, None, None).ok();
      }
    }
    None
  }

  if let Some(found) = recurse_children(window_hwnd, classes) {
    return Some(found);
  }

  for class in classes {
    unsafe {
      let wide_class = to_wide_null_terminated(class);
      let element = FindWindowExW(window_hwnd, HWND(null_mut()), windows::core::PCWSTR(wide_class.as_ptr()), None).ok();
      if let Some(element_hwnd) = element {
        if !element_hwnd.is_invalid() {
          return Some(element_hwnd);
        }
      }
    }
  }
  None
}

/// Context structure used by the EnumWindows callback to collect windows for a specific process.
struct EnumContext {
  process_id: u32,
  windows: Vec<HWND>,
}

/// Windows API callback function for EnumWindows.
///
/// Appends the window handle to the context vector if it belongs to the target process.
///
/// # Safety
/// This function is unsafe because it dereferences raw pointers passed from Windows.
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
  let context_ptr = lparam.0 as *mut EnumContext;
  if context_ptr.is_null() {
    return BOOL(0);
  }
  let context = &mut *context_ptr;

  let mut pid = 0u32;
  GetWindowThreadProcessId(hwnd, Some(&mut pid));
  if pid == context.process_id {
    context.windows.push(hwnd);
  }
  BOOL(1)
}

/// Collects all top-level windows for a given process ID.
///
/// Uses Windows EnumWindows API with a callback to collect matching windows.
///
/// # Arguments
/// * `process_id` - The process ID to search for
///
/// # Returns
/// A `Vec<HWND>` containing all window handles owned by the process
fn collect_windows_for_pid(process_id: u32) -> Vec<HWND> {
  let mut context = EnumContext {
    process_id,
    windows: Vec::new(),
  };
  unsafe {
    let _ = EnumWindows(
      Some(enum_windows_proc),
      LPARAM((&mut context as *mut EnumContext) as isize),
    );
  }
  context.windows
}

/// Checks if a window is top-level and visible.
///
/// A top-level window has no owner (GW_OWNER returns invalid) and IsWindowVisible returns true.
///
/// # Arguments
/// * `hwnd` - The window handle to check
///
/// # Returns
/// `true` if the window is top-level and visible
fn is_top_level_visible(hwnd: HWND) -> bool {
  let owner = unsafe { GetWindow(hwnd, GW_OWNER) };
  owner.is_ok_and(|h| h.is_invalid()) && unsafe { IsWindowVisible(hwnd).as_bool() }
}

/// Retrieves windows for a process using Windows UIAutomation.
///
/// This method uses the COM-based UIAutomation API to discover windows, which is more
/// reliable with modern applications.
///
/// # Arguments
/// * `process_id` - The process ID to search for
///
/// # Returns
/// A `Result` containing a `Vec<HWND>` of top-level visible windows, or error if UIA fails
fn uia_windows_for_pid(process_id: u32, strict_top_level: bool) -> Result<Vec<HWND>> {
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia()?;
    let root = automation
      .GetRootElement()
      .map_err(|err| napi_error(format!("UIA GetRootElement failed: {err}")))?;
    let true_condition = automation
      .CreateTrueCondition()
      .map_err(|err| napi_error(format!("UIA CreateTrueCondition failed: {err}")))?;
    let all = root
      .FindAll(TreeScope_Children, &true_condition)
      .map_err(|err| napi_error(format!("UIA FindAll failed: {err}")))?;
    let length = all
      .Length()
      .map_err(|err| napi_error(format!("UIA Length failed: {err}")))?;

    let mut windows = Vec::<HWND>::new();
    for i in 0..length {
      let Ok(element) = all.GetElement(i) else {
        continue;
      };
      let Ok(pid_i32) = element.CurrentProcessId() else {
        continue;
      };
      let pid = pid_i32 as u32;
      if pid != process_id {
        continue;
      }
      let Ok(hwnd_raw) = element.CurrentNativeWindowHandle() else {
        continue;
      };
      if hwnd_raw.is_invalid() {
        continue;
      }
      let hwnd = hwnd_raw;
      if strict_top_level && !is_top_level_visible(hwnd) {
        continue;
      }
      if !strict_top_level && !is_visible(hwnd) {
        continue;
      }
      if !windows.iter().any(|existing| existing.0 == hwnd.0) {
        windows.push(hwnd);
      }
    }
    Ok(windows)
  }
}

fn enumerate_windows_strict_pid(process_id: u32) -> Vec<HWND> {
  collect_windows_for_pid(process_id)
    .into_iter()
    .filter(|hwnd| is_top_level_visible(*hwnd))
    .collect()
}

fn enumerate_windows_visible_pid(process_id: u32) -> Vec<HWND> {
  collect_windows_for_pid(process_id)
    .into_iter()
    .filter(|hwnd| is_visible(*hwnd))
    .collect()
}

fn is_probable_notepad_window(hwnd: HWND) -> bool {
  let class_name = get_class_name(hwnd);
  if class_name.eq_ignore_ascii_case("Notepad") {
    return true;
  }
  if class_name.eq_ignore_ascii_case("ApplicationFrameWindow") {
  let title = get_window_title(hwnd).to_ascii_lowercase();
    return title.contains("notepad");
  }
  false
}

fn enumerate_windows_by_image_suffix(image_suffix: &str) -> Vec<HWND> {
  collect_all_top_level_windows()
    .into_iter()
    .filter(|hwnd| is_visible(*hwnd))
    .filter(|hwnd| window_process_ends_with(*hwnd, image_suffix))
    .filter(|hwnd| is_probable_notepad_window(*hwnd))
    .collect()
}

fn enumerate_windows_by_class_names(class_names: &[&str]) -> Vec<HWND> {
  collect_all_top_level_windows()
    .into_iter()
    .filter(|hwnd| is_visible(*hwnd))
    .filter(|hwnd| {
      let class_name = get_class_name(*hwnd);
      class_names
        .iter()
        .any(|candidate| class_name.eq_ignore_ascii_case(candidate))
    })
    .collect()
}

fn finalize_discovered_windows(handles: Vec<HWND>) -> Vec<HWND> {
  let mut filtered = handles;
  if configured_executable_image_suffix().as_deref() == Some("notepad.exe") {
    filtered.retain(|hwnd| is_probable_notepad_window(*hwnd));
  }
  if filtered.is_empty() {
    return filtered;
  }
  dedupe_hwnds(sort_windows_for_selection(&filtered))
}

fn discover_windows_for_pid(process_id: u32) -> Vec<HWND> {
  if let Ok(uia_strict) = uia_windows_for_pid(process_id, true) {
    if !uia_strict.is_empty() {
      return finalize_discovered_windows(uia_strict);
    }
  }

  if let Ok(uia_relaxed) = uia_windows_for_pid(process_id, false) {
    if !uia_relaxed.is_empty() {
      return finalize_discovered_windows(uia_relaxed);
    }
  }

  let strict = enumerate_windows_strict_pid(process_id);
  if !strict.is_empty() {
    return finalize_discovered_windows(strict);
  }

  let visible_pid = enumerate_windows_visible_pid(process_id);
  if !visible_pid.is_empty() {
    return finalize_discovered_windows(visible_pid);
  }

  if let Some(image_suffix) = configured_executable_image_suffix() {
    let by_image = enumerate_windows_by_image_suffix(&image_suffix);
    if !by_image.is_empty() {
      return finalize_discovered_windows(by_image);
    }
  }

  let by_class = enumerate_windows_by_class_names(&["Notepad", "ApplicationFrameWindow"]);
  if !by_class.is_empty() {
    return finalize_discovered_windows(by_class);
  }

  Vec::new()
}

#[napi(object)]
pub struct WindowDebugInfo {
  pub hwnd: String,
  pub pid: u32,
  pub class_name: String,
  pub title: String,
  pub visible: bool,
  pub owner_invalid: bool,
  pub matches_target_pid: bool,
  pub passes_top_level_visible: bool,
  pub process_image: String,
}

/// Returns diagnostic information for all top-level windows and how they relate to a target PID.
#[napi(js_name = "debugDiscovery")]
pub fn debug_discovery(process_id: u32) -> Result<Vec<WindowDebugInfo>> {
  let mut entries = Vec::new();
  for hwnd in collect_all_top_level_windows() {
    let pid = window_pid(hwnd);
    let owner = unsafe { GetWindow(hwnd, GW_OWNER) };
    let owner_invalid = owner.is_ok_and(|h| h.is_invalid());
    let visible = is_visible(hwnd);
    entries.push(WindowDebugInfo {
      hwnd: hwnd_to_string(hwnd),
      pid,
      class_name: get_class_name(hwnd),
      title: get_window_title(hwnd),
      visible,
      owner_invalid,
      matches_target_pid: pid == process_id,
      passes_top_level_visible: is_top_level_visible(hwnd),
      process_image: process_image_for_pid(pid),
    });
  }
  Ok(entries)
}

/// Creates and initializes a Windows UIAutomation COM object.
///
/// # Safety
/// This function is unsafe because it initializes COM and creates COM objects.
///
/// # Returns
/// A `Result` containing the `IUIAutomation` interface or an error if creation fails
unsafe fn create_uia() -> Result<IUIAutomation> {
  CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
    .map_err(|err| napi_error(format!("Failed to create UIAutomation instance: {err}")))
}

/// Health check function exposed to Node.js.
///
/// # Returns
/// Always returns "ok" to indicate the native module is loaded and functional
#[napi]
pub fn ping() -> String {
  "ok".to_string()
}

/// Sets the application configuration for automation.
///
/// # Arguments
/// * `executable` - Path to the executable to launch
/// * `class_names` - List of window class names to search for interactive elements
#[napi]
pub fn set_app_config(executable: String, class_names: Vec<String>) {
  *CONFIG.lock().unwrap() = Some(AppConfig { executable, class_names });
}

/// Launches a Windows executable and returns its process ID.
///
/// # Arguments
/// * `executable_path` - Optional full path to the executable to launch. If None, uses the configured executable.
///
/// # Returns
/// A `Result` containing the process ID, or error if the process cannot be spawned
#[napi]
pub async fn launch(executable_path: Option<String>) -> Result<u32> {
  let path = if let Some(p) = executable_path {
    p
  } else {
    CONFIG.lock().unwrap().as_ref().ok_or_else(|| napi_error("App config not set"))?.executable.clone()
  };
  let child = Command::new(&path)
    .spawn()
    .map_err(|err| napi_error(format!("Failed to launch process: {err}")))?;

  let child_pid = child.id();
  let image_suffix = configured_executable_image_suffix();
  for _ in 0..30 {
    let windows = discover_windows_for_pid(child_pid);
    if let Some(hwnd) = windows.first() {
      let owner_pid = window_pid(*hwnd);
      if owner_pid != 0 {
        if let Some(ref suffix) = image_suffix {
          if process_image_for_pid(owner_pid)
            .to_ascii_lowercase()
            .ends_with(suffix)
          {
            return Ok(owner_pid);
          }
        } else {
          return Ok(owner_pid);
        }
      }
    }
    std::thread::sleep(Duration::from_millis(100));
  }

  Ok(child_pid)
}

/// Discovers all top-level visible windows for a given process.
///
/// Uses a multi-strategy approach:
/// 1. UIAutomation discovery (most reliable for modern apps)
/// 2. Direct Win32 EnumWindows enumeration
///
/// # Arguments
/// * `process_id` - The process ID to query
///
/// # Returns
/// A `Result` containing a vector of window handles as strings
#[napi(js_name = "enumerateWindows")]
pub async fn enumerate_windows(process_id: u32) -> Result<Vec<String>> {
  let windows = discover_windows_for_pid(process_id);
  Ok(windows.into_iter().map(hwnd_to_string).collect())
}

fn is_process_running(pid: u32) -> bool {
  if pid == 0 {
    return false;
  }
  let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
  let Ok(handle) = process else {
    return false;
  };
  if handle.is_invalid() {
    return false;
  }
  let mut exit_code = 0u32;
  let ok = unsafe { GetExitCodeProcess(handle, &mut exit_code).is_ok() };
  let _ = unsafe { CloseHandle(handle) };
  ok && exit_code == STILL_ACTIVE
}

fn terminate_process(pid: u32) -> Result<()> {
  let process = unsafe { OpenProcess(PROCESS_TERMINATE, false, pid) };
  let Ok(handle) = process else {
    return Ok(());
  };
  if handle.is_invalid() {
    return Ok(());
  }
  let result = unsafe { TerminateProcess(handle, 1) };
  let _ = unsafe { CloseHandle(handle) };
  if result.is_err() {
    return Err(napi_error(format!("TerminateProcess failed for pid {pid}")));
  }
  Ok(())
}

fn close_app_internal(process_id: u32) -> Result<()> {
  if !is_process_running(process_id) {
    return Ok(());
  }

  for hwnd in discover_windows_for_pid(process_id) {
    unsafe {
      let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
    }
  }

  for _ in 0..40 {
    if !is_process_running(process_id) {
      return Ok(());
    }
    std::thread::sleep(Duration::from_millis(50));
  }

  if is_process_running(process_id) {
    terminate_process(process_id)?;
    for _ in 0..20 {
      if !is_process_running(process_id) {
        return Ok(());
      }
      std::thread::sleep(Duration::from_millis(50));
    }
    if is_process_running(process_id) {
      return Err(napi_error(format!(
        "Process {process_id} did not exit after close"
      )));
    }
  }

  Ok(())
}

/// Closes an application by process ID: WM_CLOSE on discovered windows, then terminate if needed.
#[napi(js_name = "closeApp")]
pub async fn close_app(process_id: u32) -> Result<()> {
  close_app_internal(process_id)
}

/// Locates an interactive element within a window.
///
/// # Arguments
/// * `window_handle` - String representation of the window handle
/// * `class_names` - Optional list of class names to search for. If None, uses configured class names.
/// * `_automation_id` - (Unused) Automation ID for element lookup
/// * `_name` - (Unused) Name property for element lookup
/// * `_role` - (Unused) Role property for element lookup
///
/// # Returns
/// A `Result` containing `Some(handle)` if an element is found, or `None` as fallback
#[napi(js_name = "findElement")]
pub async fn find_element(
  window_handle: String,
  class_names: Option<Vec<String>>,
  _automation_id: Option<String>,
  _name: Option<String>,
  _role: Option<String>,
) -> Result<Option<String>> {
  let classes = if let Some(c) = class_names {
    c
  } else {
    CONFIG.lock().unwrap().as_ref().map(|config| config.class_names.clone()).unwrap_or_default()
  };

  if classes.is_empty() {
    return Ok(None);
  }

  let hwnd = parse_hwnd(&window_handle)?;

  if let Some(element_hwnd) = find_element_hwnd(hwnd, &classes) {
    return Ok(Some(hwnd_to_string(element_hwnd)));
  }

  // Win11 Notepad often exposes the editable surface on the top-level Notepad HWND.
  if is_probable_notepad_window(hwnd) {
    return Ok(Some(window_handle));
  }

  Ok(None)
}

/// Sets text content of a window element using the WM_SETTEXT message.
///
/// Sends a Windows message to set the text of the target window/control.
/// This is a synchronous operation at the Windows message level.
///
/// # Arguments
/// * `element_handle` - String representation of the target element's window handle
/// * `text` - The text content to set
///
/// # Returns
/// A `Result` that resolves when the message is processed
#[napi(js_name = "typeText")]
pub async fn type_text(element_handle: String, text: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let wide = to_wide_null_terminated(&text);
  unsafe {
    SendMessageW(hwnd, WM_SETTEXT, WPARAM(0), LPARAM(wide.as_ptr() as isize));
  }
  Ok(())
}

fn capture_window_bitmap(hwnd: HWND) -> Result<Vec<u8>> {
  unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(napi_error("Failed to get window rectangle"));
    }
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width <= 0 || height <= 0 {
      return Err(napi_error("Invalid window bounds for screenshot"));
    }

    let hdc_window = GetWindowDC(hwnd);
    if hdc_window.is_invalid() {
      return Err(napi_error("Failed to get window device context"));
    }

    let hdc_mem = CreateCompatibleDC(hdc_window);
    if hdc_mem.is_invalid() {
      ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to create compatible DC"));
    }

    let hbitmap = CreateCompatibleBitmap(hdc_window, width, height);
    if hbitmap.is_invalid() {
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to create compatible bitmap"));
    }

    let old_obj = SelectObject(hdc_mem, hbitmap);
    if old_obj.is_invalid() {
      let _ = DeleteObject(hbitmap);
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to select bitmap into DC"));
    }

    if BitBlt(hdc_mem, 0, 0, width, height, hdc_window, 0, 0, SRCCOPY).is_err() {
      let _ = SelectObject(hdc_mem, old_obj);
      let _ = DeleteObject(hbitmap);
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to capture window bitmap"));
    }

    let header = BITMAPINFOHEADER {
      biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
      biWidth: width,
      biHeight: height,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: BI_RGB.0,
      biSizeImage: (width * height * 4) as u32,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    };

    let mut info = BITMAPINFO {
      bmiHeader: header,
      bmiColors: [RGBQUAD::default()],
    };
    let image_size = (width * height * 4) as usize;
    let mut buffer = vec![0u8; image_size];

    let result = GetDIBits(
      hdc_mem,
      hbitmap,
      0,
      height as u32,
      Some(buffer.as_mut_ptr() as *mut _),
      &mut info,
      DIB_RGB_COLORS,
    );

    let _ = SelectObject(hdc_mem, old_obj);
    let _ = DeleteObject(hbitmap);
    let _ = DeleteDC(hdc_mem);
    let _ = ReleaseDC(hwnd, hdc_window);

    if result == 0 {
      return Err(napi_error("Failed to read bitmap pixels"));
    }

    let file_header = BITMAPFILEHEADER {
      bfType: 0x4D42,
      bfSize: (std::mem::size_of::<BITMAPFILEHEADER>() + std::mem::size_of::<BITMAPINFOHEADER>() + image_size) as u32,
      bfReserved1: 0,
      bfReserved2: 0,
      bfOffBits: (std::mem::size_of::<BITMAPFILEHEADER>() + std::mem::size_of::<BITMAPINFOHEADER>()) as u32,
    };

    let mut output = Vec::with_capacity(file_header.bfSize as usize);
    output.extend_from_slice(std::slice::from_raw_parts(
      (&file_header as *const BITMAPFILEHEADER) as *const u8,
      std::mem::size_of::<BITMAPFILEHEADER>(),
    ));
    output.extend_from_slice(std::slice::from_raw_parts(
      (&header as *const BITMAPINFOHEADER) as *const u8,
      std::mem::size_of::<BITMAPINFOHEADER>(),
    ));
    output.extend_from_slice(&buffer);

    Ok(output)
  }
}

/// Captures a screenshot of the specified element or window.
///
/// # Arguments
/// * `element_handle` - String representation of the window handle to capture
///
/// # Returns
/// A `Result` containing raw BMP image bytes
#[napi(js_name = "captureScreenshot")]
pub async fn capture_screenshot(element_handle: String) -> Result<Vec<u8>> {
  let hwnd = parse_hwnd(&element_handle)?;
  capture_window_bitmap(hwnd)
}

/// Saves a screenshot to a BMP file.
///
/// # Arguments
/// * `element_handle` - String representation of the window handle to capture
/// * `path` - Destination file path
///
/// # Returns
/// A `Result` that resolves when the file is written
#[napi(js_name = "captureScreenshotToFile")]
pub async fn capture_screenshot_to_file(element_handle: String, path: String) -> Result<()> {
  let bytes = capture_screenshot(element_handle).await?;
  std::fs::write(path, bytes).map_err(|err| napi_error(format!("Failed to write screenshot file: {err}")))
}

/// Moves the mouse cursor to hover over an element.
///
/// # Arguments
/// * `element_handle` - String representation of the target element's window handle
///
/// # Returns
/// A `Result` that resolves when the hover operation is complete
#[napi(js_name = "hoverElement")]
pub async fn hover_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(napi_error("Failed to get window rectangle"));
    }
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    if SetCursorPos(center_x, center_y).is_err() {
      return Err(napi_error("Failed to set cursor position"));
    }
  }
  Ok(())
}

/// Scrolls an element in the specified direction.
///
/// # Arguments
/// * `element_handle` - String representation of the target element's window handle
/// * `direction` - Direction to scroll: "up", "down", "left", "right"
/// * `amount` - Number of scroll units (typically 1-3 for smooth scrolling)
///
/// # Returns
/// A `Result` that resolves when the scroll operation is complete
#[napi(js_name = "scrollElement")]
pub async fn scroll_element(element_handle: String, direction: String, amount: i32) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let (wparam, msg) = match direction.as_str() {
    "up" => (WPARAM(0), WM_VSCROLL),
    "down" => (WPARAM(1), WM_VSCROLL),
    "left" => (WPARAM(0), WM_HSCROLL),
    "right" => (WPARAM(1), WM_HSCROLL),
    _ => return Err(napi_error(format!("Invalid scroll direction: {}", direction))),
  };

  unsafe {
    for _ in 0..amount {
      SendMessageW(hwnd, msg, wparam, LPARAM(0));
    }
  }
  Ok(())
}

/// Performs a drag and drop operation from one element to another.
///
/// # Arguments
/// * `from_element_handle` - String representation of the source element's window handle
/// * `to_element_handle` - String representation of the target element's window handle
///
/// # Returns
/// A `Result` that resolves when the drag and drop operation is complete
#[napi(js_name = "dragDrop")]
pub async fn drag_drop(from_element_handle: String, to_element_handle: String) -> Result<()> {
  let from_hwnd = parse_hwnd(&from_element_handle)?;
  let to_hwnd = parse_hwnd(&to_element_handle)?;

  unsafe {
    // Get source position
    let mut from_rect = RECT::default();
    if GetWindowRect(from_hwnd, &mut from_rect).is_err() {
      return Err(napi_error("Failed to get source window rectangle"));
    }
    let from_x = (from_rect.left + from_rect.right) / 2;
    let from_y = (from_rect.top + from_rect.bottom) / 2;

    // Get target position
    let mut to_rect = RECT::default();
    if GetWindowRect(to_hwnd, &mut to_rect).is_err() {
      return Err(napi_error("Failed to get target window rectangle"));
    }
    let to_x = (to_rect.left + to_rect.right) / 2;
    let to_y = (to_rect.top + to_rect.bottom) / 2;

    // Move to source and press down
    let _ = SetCursorPos(from_x, from_y);
    let input_down = INPUT {
      r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_MOUSE,
      Anonymous: INPUT_0 {
        mi: MOUSEINPUT {
          dx: 0,
          dy: 0,
          mouseData: 0,
          dwFlags: MOUSEEVENTF_LEFTDOWN,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input_down], std::mem::size_of::<INPUT>() as i32);

    // Small delay
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Move to target
    let _ = SetCursorPos(to_x, to_y);
    let input_move = INPUT {
      r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_MOUSE,
      Anonymous: INPUT_0 {
        mi: MOUSEINPUT {
          dx: 0,
          dy: 0,
          mouseData: 0,
          dwFlags: MOUSEEVENTF_MOVE,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input_move], std::mem::size_of::<INPUT>() as i32);

    // Small delay
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Release
    let input_up = INPUT {
      r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_MOUSE,
      Anonymous: INPUT_0 {
        mi: MOUSEINPUT {
          dx: 0,
          dy: 0,
          mouseData: 0,
          dwFlags: MOUSEEVENTF_LEFTUP,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input_up], std::mem::size_of::<INPUT>() as i32);
  }

  Ok(())
}
