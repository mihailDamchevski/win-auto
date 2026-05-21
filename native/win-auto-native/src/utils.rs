use napi::Result;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER};
use windows::core::PWSTR;

const BASE_DPI: u32 = 96;

pub fn get_dpi_for_window(hwnd: HWND) -> u32 {
  unsafe {
    let dpi = GetDpiForWindow(hwnd);
    if dpi > 0 { dpi as u32 } else { BASE_DPI }
  }
}

pub fn get_dpi_scale(hwnd: HWND) -> f64 {
  f64::from(get_dpi_for_window(hwnd)) / f64::from(BASE_DPI)
}

pub fn logical_to_physical(hwnd: HWND, value: i32) -> i32 {
  (f64::from(value) * get_dpi_scale(hwnd)).round() as i32
}

pub fn physical_to_logical(hwnd: HWND, value: i32) -> i32 {
  let scale = get_dpi_scale(hwnd);
  if scale > 0.0 {
    (f64::from(value) / scale).round() as i32
  } else {
    value
  }
}

use crate::error::napi_error;

/// RAII guard that calls CoInitializeEx on construction and CoUninitialize on drop.
/// Never fails — RPC_E_CHANGED_MODE (COM already initialized) is treated as success.
pub struct ComGuard {
  needs_uninit: bool,
}

impl ComGuard {
  pub fn init() -> Self {
    unsafe {
      let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
      ComGuard { needs_uninit: hr.is_ok() }
    }
  }
}

impl Drop for ComGuard {
  fn drop(&mut self) {
    if self.needs_uninit {
      unsafe { CoUninitialize(); }
    }
  }
}

pub fn parse_hwnd(handle: &str) -> Result<HWND> {
  let value = handle
    .parse::<isize>()
    .map_err(|_| napi_error(format!("Invalid window/element handle: {handle}")))?;
  Ok(HWND(value as *mut core::ffi::c_void))
}

pub fn hwnd_to_string(hwnd: HWND) -> String {
  format!("{}", hwnd.0 as isize)
}

pub fn to_wide_null_terminated(value: &str) -> Vec<u16> {
  value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn get_class_name(hwnd: HWND) -> String {
  unsafe {
    let mut buffer = vec![0u16; 256];
    let copied = GetClassNameW(hwnd, &mut buffer);
    if copied <= 0 {
      return String::new();
    }
    String::from_utf16_lossy(&buffer[..copied as usize]).to_string()
  }
}

pub fn get_window_title(hwnd: HWND) -> String {
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

pub fn window_pid(hwnd: HWND) -> u32 {
  let mut pid = 0u32;
  unsafe {
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
  }
  pid
}

pub fn process_image_for_pid(pid: u32) -> String {
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
      PWSTR(buffer.as_mut_ptr()),
      &mut size,
    )
  };
  let _ = unsafe { CloseHandle(handle) };
  if query.is_err() || size == 0 {
    return String::new();
  }

  String::from_utf16_lossy(&buffer[..size as usize])
}

pub fn window_process_ends_with(hwnd: HWND, image_suffix: &str) -> bool {
  let pid = window_pid(hwnd);
  if pid == 0 {
    return false;
  }
  process_image_for_pid(pid)
    .to_ascii_lowercase()
    .ends_with(&image_suffix.to_ascii_lowercase())
}

pub fn is_visible(hwnd: HWND) -> bool {
  unsafe { IsWindowVisible(hwnd).as_bool() }
}

pub fn is_top_level_visible(hwnd: HWND) -> bool {
  unsafe { GetWindow(hwnd, GW_OWNER) }
    .ok()
    .map_or(false, |owner| owner.is_invalid())
    && is_visible(hwnd)
}

pub fn is_probable_notepad_window(hwnd: HWND) -> bool {
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

pub fn hwnd_priority(class_name: &str) -> i32 {
  if class_name.eq_ignore_ascii_case("Notepad") {
    return 0;
  }
  if class_name.eq_ignore_ascii_case("ApplicationFrameWindow") {
    return 1;
  }
  2
}

pub fn sort_windows_for_selection(handles: &[HWND]) -> Vec<HWND> {
  let mut sorted = handles.to_vec();
  sorted.sort_by_key(|hwnd| {
    let class_name = get_class_name(*hwnd);
    (hwnd_priority(&class_name), class_name)
  });
  sorted
}

pub fn dedupe_hwnds(handles: Vec<HWND>) -> Vec<HWND> {
  let mut unique = Vec::<HWND>::new();
  for hwnd in handles {
    if !unique.iter().any(|existing| existing.0 == hwnd.0) {
      unique.push(hwnd);
    }
  }
  unique
}

