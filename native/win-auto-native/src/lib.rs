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
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
  BitBlt, BI_RGB, BITMAPFILEHEADER, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap,
  CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetWindowDC, ReleaseDC, RGBQUAD,
  SelectObject, SRCCOPY, DIB_RGB_COLORS,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, COINIT_APARTMENTTHREADED, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, TreeScope_Children};
use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEINPUT};
use windows::Win32::UI::WindowsAndMessaging::{
  EnumWindows, FindWindowExW, GetClassNameW, GetWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
  SendMessageW, SetCursorPos, GW_OWNER, WM_HSCROLL, WM_SETTEXT, WM_VSCROLL,
};

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

/// Recursively searches for edit control windows with specified class names.
///
/// # Arguments
/// * `window_hwnd` - The parent window to search within
/// * `classes` - List of class names to search for
///
/// # Returns
/// `Some(HWND)` if an element with matching class is found, `None` otherwise
fn find_element_hwnd(window_hwnd: HWND, classes: &[String]) -> Option<HWND> {
  fn recurse_children(parent: HWND, classes: &[String]) -> Option<HWND> {
    unsafe {
      let mut child = FindWindowExW(parent, HWND(null_mut()), None, None).ok();
      while let Some(current) = child {
        if current.is_invalid() {
          break;
        }
        let class_name = get_class_name(current);
        if classes.iter().any(|c| class_name.eq_ignore_ascii_case(c)) {
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
fn uia_windows_for_pid(process_id: u32) -> Result<Vec<HWND>> {
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
      if !is_top_level_visible(hwnd) {
        continue;
      }
      if !windows.iter().any(|existing| existing.0 == hwnd.0) {
        windows.push(hwnd);
      }
    }
    Ok(windows)
  }
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

  Ok(child.id())
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
  // Prefer UIAutomation discovery first; this is more reliable with modern applications.
  let uia_windows = uia_windows_for_pid(process_id)?;
  if !uia_windows.is_empty() {
    return Ok(uia_windows.into_iter().map(hwnd_to_string).collect());
  }

  let context_windows = collect_windows_for_pid(process_id);

  let scoped = context_windows
    .into_iter()
    .filter(|hwnd| is_top_level_visible(*hwnd))
    .map(hwnd_to_string)
    .collect::<Vec<_>>();

  Ok(scoped)
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
    return Ok(Some(window_handle));
  }

  let hwnd = parse_hwnd(&window_handle)?;

  if let Some(element_hwnd) = find_element_hwnd(hwnd, &classes) {
    return Ok(Some(hwnd_to_string(element_hwnd)));
  }

  Ok(Some(window_handle))
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
