use std::cell::RefCell;
use napi::{Error, Result};
use napi_derive::napi;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, TreeScope_Children, TreeScope_Descendants};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, FindWindowExW, GetAncestor, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowUnicode, GWL_EXSTYLE, GWL_STYLE, GA_PARENT, GW_OWNER};

use crate::error::AutomationError;
use crate::utils::{get_class_name, get_window_title, matches_window_by_class_or_title, is_top_level_visible, is_visible, process_image_for_pid, window_pid, hwnd_to_string, sort_windows_for_selection, dedupe_hwnds, to_wide_null_terminated, window_process_ends_with};

struct AllWindowsContext {
  windows: Vec<HWND>,
}

// SAFETY: Called by EnumWindows as a callback; lparam is a valid pointer to
// AllWindowsContext that outlives the EnumWindows call (stack-allocated in caller).
unsafe extern "system" fn enum_all_windows_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
  let context_ptr = lparam.0 as *mut AllWindowsContext;
  if context_ptr.is_null() {
    return windows::core::BOOL(0);
  }
  let context = unsafe { &mut *context_ptr };
  context.windows.push(hwnd);
  windows::core::BOOL(1)
}

pub fn collect_all_top_level_windows() -> Vec<HWND> {
  let mut context = AllWindowsContext { windows: Vec::new() };
  // SAFETY: context is stack-allocated and outlives EnumWindows; the raw pointer
  // passed as LPARAM is valid for the callback's entire execution.
  unsafe {
    let _ = EnumWindows(
      Some(enum_all_windows_proc),
      LPARAM((&mut context as *mut AllWindowsContext) as isize),
    );
  }
  context.windows
}

pub fn collect_windows_for_pid(process_id: u32) -> Vec<HWND> {
  struct EnumContext {
    process_id: u32,
    windows: Vec<HWND>,
  }

  // SAFETY: Called by EnumWindows as a callback; lparam is a valid pointer to
  // EnumContext that outlives the EnumWindows call (stack-allocated in caller).
  unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    let context_ptr = lparam.0 as *mut EnumContext;
    if context_ptr.is_null() {
      return windows::core::BOOL(0);
    }
    let context = unsafe { &mut *context_ptr };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)); }
    if pid == context.process_id {
      context.windows.push(hwnd);
    }
    windows::core::BOOL(1)
  }

  let mut context = EnumContext {
    process_id,
    windows: Vec::new(),
  };
  // SAFETY: context is stack-allocated and outlives EnumWindows; the raw pointer
  // passed as LPARAM is valid for the callback's entire execution.
  unsafe {
    let _ = EnumWindows(
      Some(enum_windows_proc),
      LPARAM((&mut context as *mut EnumContext) as isize),
    );
  }
  context.windows
}

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

pub fn find_element_hwnd(window_hwnd: HWND, classes: &[String]) -> Option<HWND> {
  fn recurse_children(parent: HWND, classes: &[String]) -> Option<HWND> {
    // SAFETY: FindWindowExW enumerates child windows; parent is a valid HWND from the caller.
    unsafe {
      let mut child = FindWindowExW(Some(parent), None, windows::core::PCWSTR::null(), windows::core::PCWSTR::null()).ok();
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
        child = FindWindowExW(Some(parent), Some(current), windows::core::PCWSTR::null(), windows::core::PCWSTR::null()).ok();
      }
    }
    None
  }

  if let Some(found) = recurse_children(window_hwnd, classes) {
    return Some(found);
  }

  for class in classes {
    // SAFETY: wide_class is a null-terminated wide string; window_hwnd is a valid HWND.
    unsafe {
      let wide_class = to_wide_null_terminated(class);
      let element = FindWindowExW(Some(window_hwnd), None, windows::core::PCWSTR(wide_class.as_ptr()), windows::core::PCWSTR::null()).ok();
      if let Some(element_hwnd) = element {
        if !element_hwnd.is_invalid() {
          return Some(element_hwnd);
        }
      }
    }
  }
  None
}

pub fn find_child_window_by_text(window_hwnd: HWND, query: &str) -> Option<HWND> {
  // SAFETY: FindWindowExW enumerates child windows; window_hwnd is valid from caller.
  unsafe {
    let mut child = FindWindowExW(Some(window_hwnd), None, windows::core::PCWSTR::null(), windows::core::PCWSTR::null()).ok();
    while let Some(current) = child {
      if current.is_invalid() {
        break;
      }

      let text = get_window_title(current);
      if !text.is_empty() && text.to_ascii_lowercase().contains(&query.to_ascii_lowercase()) {
        return Some(current);
      }

      if let Some(found_nested) = find_child_window_by_text(current, query) {
        return Some(found_nested);
      }

      child = FindWindowExW(Some(window_hwnd), Some(current), windows::core::PCWSTR::null(), windows::core::PCWSTR::null()).ok();
    }
  }
  None
}

pub fn find_element_uia(window_hwnd: HWND, query: &str) -> Option<HWND> {
  let _com_init = crate::utils::ComScope::init();
  let automation = unsafe { create_uia().ok()? };
  let root = unsafe { automation.ElementFromHandle(window_hwnd).ok()? };
  let true_condition = unsafe { automation.CreateTrueCondition().ok()? };
  let all = unsafe { root.FindAll(TreeScope_Descendants, &true_condition).ok()? };
  let length = unsafe { all.Length().ok()? };

  for i in 0..length {
    let element = unsafe { all.GetElement(i).ok()? };
    let current_name = unsafe { element.CurrentName().ok()? }.to_string();
    if !current_name.is_empty() && current_name.to_ascii_lowercase().contains(&query.to_ascii_lowercase()) {
      let hwnd_raw = unsafe { element.CurrentNativeWindowHandle().ok()? };
      if !hwnd_raw.is_invalid() {
        return Some(hwnd_raw);
      }
    }
  }
  None
}

pub fn enumerate_windows_strict_pid(process_id: u32) -> Vec<HWND> {
  collect_windows_for_pid(process_id)
    .into_iter()
    .filter(|hwnd| is_top_level_visible(*hwnd))
    .collect()
}

pub fn enumerate_windows_visible_pid(process_id: u32) -> Vec<HWND> {
  collect_windows_for_pid(process_id)
    .into_iter()
    .filter(|hwnd| is_visible(*hwnd))
    .collect()
}

pub fn enumerate_windows_by_image_suffix(image_suffix: &str) -> Vec<HWND> {
  collect_all_top_level_windows()
    .into_iter()
    .filter(|hwnd| is_visible(*hwnd))
    .filter(|hwnd| window_process_ends_with(*hwnd, image_suffix))
    .collect()
}

#[allow(dead_code)]
pub fn enumerate_windows_by_class_names(class_names: &[&str]) -> Vec<HWND> {
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

pub fn finalize_discovered_windows(handles: Vec<HWND>) -> Vec<HWND> {
  let mut filtered: Vec<HWND> = handles;
  filtered.retain(|hwnd| matches_window_by_class_or_title(*hwnd));
  if filtered.is_empty() {
    return filtered;
  }
  dedupe_hwnds(sort_windows_for_selection(&filtered))
}

pub fn discover_windows_for_pid(process_id: u32, executable: Option<&str>) -> Vec<HWND> {
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

  tracing::warn!("UIA window discovery failed for pid={process_id}, falling back to Win32 EnumWindows");
  let strict = enumerate_windows_strict_pid(process_id);
  if !strict.is_empty() {
    return finalize_discovered_windows(strict);
  }

  let visible_pid = enumerate_windows_visible_pid(process_id);
  if !visible_pid.is_empty() {
    return finalize_discovered_windows(visible_pid);
  }

  // Try finding windows by process image name suffix if executable is provided
  if let Some(exe) = executable {
    if let Some(file_name) = std::path::Path::new(exe).file_name() {
      let suffix = file_name.to_string_lossy().to_ascii_lowercase();
      let by_image = enumerate_windows_by_image_suffix(&suffix);
      if !by_image.is_empty() {
        return finalize_discovered_windows(by_image);
      }
    }
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

#[napi(js_name = "debugDiscovery")]
pub fn debug_discovery(process_id: u32) -> Result<Vec<WindowDebugInfo>> {
  let mut entries = Vec::new();
  for hwnd in collect_all_top_level_windows() {
    let pid = window_pid(hwnd);
    // SAFETY: GetWindow with GW_OWNER is safe; hwnd is from EnumWindows so it's valid.
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

thread_local! {
  static UIA_INSTANCE: RefCell<Option<IUIAutomation>> = const { RefCell::new(None) };
}

/// SAFETY: CoCreateInstance with CUIAutomation is safe when COM is initialized
/// (caller must use ComScope). The thread-local cache avoids repeated allocations.
pub unsafe fn create_uia() -> Result<IUIAutomation> {
  let mut result: Option<IUIAutomation> = None;
  let _ = UIA_INSTANCE.try_with(|cell| {
    let mut guard = cell.borrow_mut();
    if let Some(ref uia) = *guard {
      result = Some(IUIAutomation::clone(uia));
    } else {
      match unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) } {
        Ok(uia) => {
          let cloned = IUIAutomation::clone(&uia);
          *guard = Some(uia);
          result = Some(cloned);
        }
            Err(_err) => {}
      }
    }
  });

  result.ok_or_else(|| Error::from(AutomationError::ComInitFailed { reason: "Failed to create UIAutomation instance".into() }))
}

pub fn uia_windows_for_pid(process_id: u32, strict_top_level: bool) -> Result<Vec<HWND>> {
  let _com_init = crate::utils::ComScope::init();
  let automation = unsafe { create_uia()? };
  let root = unsafe {
    automation.GetRootElement().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?
  };
  let true_condition = unsafe {
    automation.CreateTrueCondition().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?
  };
  let all = unsafe {
    root.FindAll(TreeScope_Children, &true_condition).map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?
  };
  let length = unsafe {
    all.Length().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?
  };

  let mut windows = Vec::<HWND>::new();
  for i in 0..length {
    let Ok(element) = (unsafe { all.GetElement(i) }) else { continue };
    let Ok(pid_i32) = (unsafe { element.CurrentProcessId() }) else { continue };
    let pid = pid_i32 as u32;
    if pid != process_id { continue; }
    let Ok(hwnd_raw) = (unsafe { element.CurrentNativeWindowHandle() }) else { continue };
    if hwnd_raw.is_invalid() { continue; }
    let hwnd = hwnd_raw;
    if strict_top_level && !is_top_level_visible(hwnd) { continue; }
    if !strict_top_level && !is_visible(hwnd) { continue; }
    if !windows.iter().any(|existing| existing.0 == hwnd.0) {
      windows.push(hwnd);
    }
  }
  Ok(windows)
}

/// HWND tree node for the legacy/raw Win32 hierarchy inspector
#[napi(object)]
pub struct HwndNode {
  pub handle: String,
  pub class_name: String,
  pub title: String,
  pub visible: bool,
  pub children: Vec<HwndNode>,
}

fn build_hwnd_tree(parent: HWND, max_depth: i32) -> Vec<HwndNode> {
  if max_depth <= 0 {
    return Vec::new();
  }

  let mut nodes = Vec::new();
  // SAFETY: FindWindowExW recursively enumerates child windows; parent is a valid HWND.
  unsafe {
    let mut child = FindWindowExW(Some(parent), None, None, None).ok();
    while let Some(current) = child {
      if current.is_invalid() {
        break;
      }
      let class_name = get_class_name(current);
      let title = get_window_title(current);
      let visible = is_visible(current);
      let children = build_hwnd_tree(current, max_depth - 1);
      nodes.push(HwndNode {
        handle: hwnd_to_string(current),
        class_name,
        title,
        visible,
        children,
      });
      child = FindWindowExW(Some(parent), Some(current), None, None).ok();
    }
  }
  nodes
}

/// Inspects the raw Win32 HWND tree under a given window handle.
/// Unlike inspectWindowTree (which uses UIA), this shows the real HWND
/// hierarchy with class names and window text — essential for legacy app debugging.
#[napi(js_name = "inspectHwndTree")]
pub fn inspect_hwnd_tree(window_handle: String, max_depth: Option<i32>) -> Result<Vec<HwndNode>> {
  let hwnd = crate::utils::parse_hwnd(&window_handle)?;
  let depth = max_depth.unwrap_or(10);
  let children = build_hwnd_tree(hwnd, depth);
  Ok(children)
}

/// Detailed Win32 legacy info about a window handle.
/// Returns className, text, style, exStyle, pid, threadId, isUnicode,
/// parentHwnd, ownerHwnd, dpi.
#[napi(object)]
pub struct WindowInfo {
  pub class_name: String,
  pub text: String,
  pub style: i32,
  pub ex_style: i32,
  pub pid: u32,
  pub thread_id: u32,
  pub is_unicode: bool,
  pub parent_hwnd: String,
  pub owner_hwnd: String,
  pub dpi: u32,
}

#[napi(js_name = "getWindowInfo")]
pub fn get_window_info(window_handle: String) -> Result<WindowInfo> {
  let hwnd = crate::utils::parse_hwnd(&window_handle)?;
  unsafe {
    let class_name = crate::utils::get_class_name(hwnd);

    let text_length = GetWindowTextLengthW(hwnd);
    let text = if text_length > 0 {
      let mut buffer = vec![0u16; (text_length + 1) as usize];
      let copied = GetWindowTextW(hwnd, &mut buffer);
      if copied > 0 {
        String::from_utf16_lossy(&buffer[..copied as usize])
      } else {
        String::new()
      }
    } else {
      String::new()
    };

    let style = GetWindowLongW(hwnd, GWL_STYLE);
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);

    let mut pid = 0u32;
    let mut thread_id = 0u32;
    thread_id = GetWindowThreadProcessId(hwnd, Some(&mut pid));

    let is_unicode = IsWindowUnicode(hwnd).as_bool();

    let parent_hwnd = GetAncestor(hwnd, GA_PARENT);
    let parent_hwnd_str = if parent_hwnd.is_invalid() {
      "0".to_string()
    } else {
      hwnd_to_string(parent_hwnd)
    };

    let owner_hwnd = GetWindow(hwnd, GW_OWNER)
      .map(|h| hwnd_to_string(h))
      .unwrap_or_else(|_| "0".to_string());

    let dpi = crate::utils::get_dpi_for_window(hwnd);

    Ok(WindowInfo {
      class_name,
      text,
      style,
      ex_style,
      pid,
      thread_id,
      is_unicode,
      parent_hwnd: parent_hwnd_str,
      owner_hwnd,
      dpi,
    })
  }
}
