use std::ptr::null_mut;
use napi::{Result};
use napi_derive::napi;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, COINIT_APARTMENTTHREADED, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, TreeScope_Children, TreeScope_Descendants};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, FindWindowExW, GetWindow, GetWindowThreadProcessId, GW_OWNER};

use crate::config::configured_executable_image_suffix;
use crate::error::napi_error;
use crate::utils::{get_class_name, get_window_title, is_probable_notepad_window, is_top_level_visible, is_visible, process_image_for_pid, window_pid, hwnd_to_string, sort_windows_for_selection, dedupe_hwnds, to_wide_null_terminated, window_process_ends_with};

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

pub fn collect_all_top_level_windows() -> Vec<HWND> {
  let mut context = AllWindowsContext { windows: Vec::new() };
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

pub fn find_child_window_by_text(window_hwnd: HWND, query: &str) -> Option<HWND> {
  unsafe {
    let mut child = FindWindowExW(window_hwnd, HWND(null_mut()), None, None).ok();
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

      child = FindWindowExW(window_hwnd, current, None, None).ok();
    }
  }
  None
}

pub fn find_element_uia(window_hwnd: HWND, query: &str) -> Option<HWND> {
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().ok()?;
    let root = automation.ElementFromHandle(window_hwnd).ok()?;
    let true_condition = automation.CreateTrueCondition().ok()?;
    let all = root.FindAll(TreeScope_Descendants, &true_condition).ok()?;
    let length = all.Length().ok()?;

    for i in 0..length {
      let element = all.GetElement(i).ok()?;
      let current_name = element.CurrentName().ok()?.to_string();
      if !current_name.is_empty() && current_name.to_ascii_lowercase().contains(&query.to_ascii_lowercase()) {
        let hwnd_raw = element.CurrentNativeWindowHandle().ok()?;
        if !hwnd_raw.is_invalid() {
          return Some(hwnd_raw);
        }
      }
    }
    None
  }
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
    .filter(|hwnd| is_probable_notepad_window(*hwnd))
    .collect()
}

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
  let mut filtered = handles;
  if configured_executable_image_suffix().as_deref() == Some("notepad.exe") {
    filtered.retain(|hwnd| is_probable_notepad_window(*hwnd));
  }
  if filtered.is_empty() {
    return filtered;
  }
  dedupe_hwnds(sort_windows_for_selection(&filtered))
}

pub fn discover_windows_for_pid(process_id: u32) -> Vec<HWND> {
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

pub unsafe fn create_uia() -> Result<IUIAutomation> {
  CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
    .map_err(|err| napi_error(format!("Failed to create UIAutomation instance: {err}")))
}

pub fn uia_windows_for_pid(process_id: u32, strict_top_level: bool) -> Result<Vec<HWND>> {
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia()?;
    let root = automation.GetRootElement().map_err(|err| napi_error(format!("UIA GetRootElement failed: {err}")))?;
    let true_condition = automation.CreateTrueCondition().map_err(|err| napi_error(format!("UIA CreateTrueCondition failed: {err}")))?;
    let all = root.FindAll(TreeScope_Children, &true_condition).map_err(|err| napi_error(format!("UIA FindAll failed: {err}")))?;
    let length = all.Length().map_err(|err| napi_error(format!("UIA Length failed: {err}")))?;

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
