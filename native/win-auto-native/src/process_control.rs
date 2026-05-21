use std::process::Command;
use std::thread::sleep;
use std::time::Duration;
use napi::{Result};
use napi_derive::napi;
use windows::Win32::Foundation::{CloseHandle, WPARAM, LPARAM};
use windows::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};

use crate::config::{configured_executable_image_suffix, get_config};
use crate::discovery::discover_windows_for_pid;
use crate::error::napi_error;
use crate::utils::{process_image_for_pid, window_pid};

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
  ok && exit_code == 259
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
    sleep(Duration::from_millis(50));
  }

  if is_process_running(process_id) {
    terminate_process(process_id)?;
    for _ in 0..20 {
      if !is_process_running(process_id) {
        return Ok(());
      }
      sleep(Duration::from_millis(50));
    }
    if is_process_running(process_id) {
      return Err(napi_error(format!("Process {process_id} did not exit after close")));
    }
  }

  Ok(())
}

#[napi]
pub async fn launch(executable_path: Option<String>) -> Result<u32> {
  let path = if let Some(p) = executable_path {
    p
  } else {
    get_config()
      .ok_or_else(|| napi_error("App config not set"))?
      .executable
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
    sleep(Duration::from_millis(100));
  }

  Ok(child_pid)
}

#[napi(js_name = "closeApp")]
pub async fn close_app(process_id: u32) -> Result<()> {
  close_app_internal(process_id)
}

#[napi(js_name = "closeWindow")]
pub async fn close_window(window_handle: String) -> Result<()> {
  let hwnd = crate::utils::parse_hwnd(&window_handle)?;
  unsafe {
    let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
  }
  Ok(())
}

#[napi(js_name = "isProcessRunning")]
pub fn is_process_running_export(process_id: u32) -> bool {
  is_process_running(process_id)
}
