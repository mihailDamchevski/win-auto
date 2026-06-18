use std::cell::Cell;

use napi::{Error, Result};
use tracing::warn;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW};
use windows::Win32::UI::HiDpi::{GetDpiForSystem, GetDpiForWindow};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER};
use windows::core::PWSTR;

const BASE_DPI: u32 = 96;

pub fn get_dpi_for_window(hwnd: HWND) -> u32 {
  // SAFETY: hwnd is a valid window handle from the system; GetDpiForWindow accepts null/invalid handles gracefully.
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
  (f64::from(value) / scale).round() as i32
}

/// Returns the system DPI (primary monitor only).
///
/// **Multi-monitor limitation:** This returns the DPI of the primary monitor.
/// On setups where secondary monitors have different DPI, screen-level
/// functions (mouseMove, clickAt) may land at slightly wrong positions.
/// Element-relative functions (clickElement) are unaffected since they use
/// per-window DPI via `get_dpi_for_window`.
pub fn get_system_dpi() -> u32 {
  unsafe {
    let dpi = GetDpiForSystem();
    if dpi > 0 { dpi as u32 } else { BASE_DPI }
  }
}

pub fn get_system_dpi_scale() -> f64 {
  f64::from(get_system_dpi()) / f64::from(BASE_DPI)
}

pub fn logical_to_physical_system(value: i32) -> i32 {
  (f64::from(value) * get_system_dpi_scale()).round() as i32
}

use crate::error::AutomationError;

thread_local! {
  static COM_REFCOUNT: Cell<Option<u32>> = const { Cell::new(None) };
}

/// RAII scope that calls CoInitializeEx on first use per thread and CoUninitialize
/// when the outermost scope drops, using a thread-local refcount.
/// Unlike the old ComGuard (which initted/uninitted on every call), ComScope
/// keeps COM alive across nested calls within the same thread.
///
/// Never fails — RPC_E_CHANGED_MODE (COM already initialized) is treated as success.
pub struct ComScope;

impl ComScope {
  pub fn init() -> Self {
    COM_REFCOUNT.with(|rc| {
      let prev = rc.get();
      match prev {
        None => {
          // SAFETY: CoInitializeEx with COINIT_APARTMENTTHREADED is safe to call; RPC_E_CHANGED_MODE
          // (already initialized) is handled by treating it as success per MSDN.
          unsafe {
            let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if hr.is_ok() {
              rc.set(Some(1));
            } else {
              warn!("CoInitializeEx failed with {hr:?}, treating as externally initialized");
              rc.set(None);
            }
          }
        }
        Some(_) => {
          rc.set(prev.map(|c| c + 1));
        }
      }
    });
    ComScope
  }
}

impl Drop for ComScope {
  fn drop(&mut self) {
    COM_REFCOUNT.with(|rc| {
      let prev = rc.get();
      match prev {
        None => {}
        Some(1) => {
          rc.set(None);
          unsafe { CoUninitialize(); }
        }
        Some(c) => {
          rc.set(Some(c - 1));
        }
      }
    });
  }
}

pub fn parse_hwnd(handle: &str) -> Result<HWND> {
  let value = handle
    .parse::<isize>()
    .map_err(|_| Error::from(AutomationError::InvalidHandle { handle: handle.to_string() }))?;
  if value == 0 {
    return Err(Error::from(AutomationError::InvalidHandle { handle: handle.to_string() }));
  }
  // SAFETY: reinterpretation of an isize as a raw pointer; HWND is only used
  // with Windows APIs that validate the handle internally.
  Ok(HWND(value as *mut core::ffi::c_void))
}

pub fn hwnd_to_string(hwnd: HWND) -> String {
  format!("{}", hwnd.0 as isize)
}

pub fn to_wide_null_terminated(value: &str) -> Vec<u16> {
  value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn get_class_name(hwnd: HWND) -> String {
  // SAFETY: buffer is a valid 256-element u16 array; GetClassNameW writes at most 256 chars.
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
  // SAFETY: GetWindowTextLengthW returns the required buffer size; buffer is sized
  // correctly to hold the title + null terminator; GetWindowTextW writes into it.
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
  // SAFETY: &mut pid is a valid u32 pointer; GetWindowThreadProcessId writes the PID on success.
  unsafe {
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
  }
  pid
}

pub fn process_image_for_pid(pid: u32) -> String {
  if pid == 0 {
    return String::new();
  }

  // SAFETY: pid is validated non-zero; OpenProcess returns invalid handle on failure.
  let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
  let Ok(handle) = process else {
    return String::new();
  };

  let mut buffer = vec![0u16; 1024];
  let mut size = buffer.len() as u32;
  // SAFETY: handle is a valid process handle; buffer is sized for MAX_PATH; PWSTR casts
  // from valid mutable buffer pointer.
  let query = unsafe {
    QueryFullProcessImageNameW(
      handle,
      PROCESS_NAME_WIN32,
      PWSTR(buffer.as_mut_ptr()),
      &mut size,
    )
  };
  // SAFETY: handle is still valid and owned by this function.
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
  // SAFETY: IsWindowVisible accepts any HWND; invalid handles return false gracefully.
  unsafe { IsWindowVisible(hwnd).as_bool() }
}

pub fn is_top_level_visible(hwnd: HWND) -> bool {
  // SAFETY: GetWindow with GW_OWNER is safe; the window hierarchy is managed by the OS.
  unsafe { GetWindow(hwnd, GW_OWNER) }
    .ok()
    .map_or(true, |owner| owner.is_invalid())
    && is_visible(hwnd)
}

pub fn matches_window_by_class_or_title(_hwnd: HWND) -> bool {
  // Class-name based filtering during discovery was removed with global config.
  // Filtering is now done per-query in findElement/findAll via the class_names parameter.
  true
}

pub fn hwnd_priority(_class_name: &str) -> i32 {
  // Priority-based sorting was removed with global config.
  // All windows are treated equally during discovery.
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

pub fn dedupe_hwnds(mut handles: Vec<HWND>) -> Vec<HWND> {
  handles.sort_by_key(|h| h.0 as usize);
  handles.dedup_by_key(|h| h.0 as usize);
  handles
}

