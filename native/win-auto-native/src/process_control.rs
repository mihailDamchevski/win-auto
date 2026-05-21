use std::process::Command;
use std::thread::sleep;
use std::time::Duration;
use napi::{Result};
use napi_derive::napi;
use windows::Win32::Foundation::{CloseHandle, WPARAM, LPARAM};
use windows::Win32::System::Threading::{CreateToolhelp32Snapshot, GetExitCodeProcess, OpenProcess, TerminateProcess, ThreadEntry32, PROCESS_ENTRY_32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE, TH32CS_SNAPPROCESS};
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

/// Health check function exposed to Node.js.
#[napi]
pub fn ping() -> String {
  "ok".to_string()
}

/// Discovers windows for a process and returns handles as strings.
#[napi(js_name = "enumerateWindows")]
pub async fn enumerate_windows(process_id: u32) -> Result<Vec<String>> {
  let windows = crate::discovery::discover_windows_for_pid(process_id);
  Ok(windows.into_iter().map(crate::utils::hwnd_to_string).collect())
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

#[napi(object)]
pub struct ProcessEntry {
  pub pid: u32,
  pub image_name: String,
}

#[napi(js_name = "findProcessesByName")]
pub fn find_processes_by_name(image_name: String) -> Result<Vec<ProcessEntry>> {
  let query_lower = image_name.to_ascii_lowercase();
  let mut entries = Vec::new();

  unsafe {
    let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if snapshot.is_invalid() {
      return Ok(entries);
    }

    let mut pe = PROCESS_ENTRY_32::default();
    pe.dwSize = std::mem::size_of::<PROCESS_ENTRY_32>() as u32;

    if windows::Win32::System::Threading::Process32FirstW(snapshot, &mut pe).is_ok() {
      loop {
        let name = String::from_utf16_lossy(&pe.szExeFile)
          .trim_end_matches('\0')
          .to_string();
        let name_lower = name.to_ascii_lowercase();
        if name_lower.contains(&query_lower) || query_lower.contains(&name_lower) {
          entries.push(ProcessEntry {
            pid: pe.th32ProcessID,
            image_name: name,
          });
        }
        if windows::Win32::System::Threading::Process32NextW(snapshot, &mut pe).is_err() {
          break;
        }
      }
    }

    let _ = CloseHandle(snapshot);
  }

  Ok(entries)
}

#[napi(js_name = "waitForProcessExit")]
pub async fn wait_for_process_exit(process_id: u32, timeout_ms: u32) -> Result<bool> {
  let start = std::time::Instant::now();
  let timeout = Duration::from_millis(timeout_ms as u64);

  loop {
    if !is_process_running(process_id) {
      return Ok(true);
    }
    if start.elapsed() >= timeout {
      return Ok(false);
    }
    sleep(Duration::from_millis(50));
  }
}

#[napi(js_name = "getProcessImageName")]
pub fn get_process_image_name(process_id: u32) -> Result<String> {
  Ok(process_image_for_pid(process_id))
}

#[napi(js_name = "killProcess")]
pub fn kill_process(process_id: u32) -> Result<()> {
  terminate_process(process_id)
}
