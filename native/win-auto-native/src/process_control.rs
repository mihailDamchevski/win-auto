use std::process::Command;
use std::time::Duration;
use napi::{Result};
use napi_derive::napi;
use tracing::info;
use windows::Win32::Foundation::{CloseHandle, HWND, WPARAM, LPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
use windows::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationWindowPattern, UIA_WindowPatternId};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};

use crate::discovery::{collect_all_top_level_windows, discover_windows_for_pid};
use crate::error::napi_error;
use crate::utils::{get_class_name, get_window_title, is_visible, process_image_for_pid, window_pid};

fn is_process_running(pid: u32) -> bool {
  if pid == 0 {
    return false;
  }

  // SAFETY: pid is validated non-zero; OpenProcess returns invalid handle on failure.
  let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
  let Ok(handle) = process else {
    return false;
  };
  if handle.is_invalid() {
    return false;
  }

  let mut exit_code = 0u32;
  // SAFETY: handle is a valid open process handle from OpenProcess.
  let ok = unsafe { GetExitCodeProcess(handle, &mut exit_code).is_ok() };
  // SAFETY: handle is still valid and owned by this function.
  let _ = unsafe { CloseHandle(handle) };
  ok && exit_code == 259
}

fn terminate_process(pid: u32) -> Result<()> {
  // SAFETY: pid is a valid process ID from the OS; OpenProcess returns invalid handle on failure.
  let process = unsafe { OpenProcess(PROCESS_TERMINATE, false, pid) };
  let Ok(handle) = process else {
    return Ok(());
  };
  if handle.is_invalid() {
    return Ok(());
  }

  // SAFETY: handle is a valid open process handle; TerminateProcess is inherently unsafe.
  let result = unsafe { TerminateProcess(handle, 1) };
  // SAFETY: handle is still valid and owned by this function.
  let _ = unsafe { CloseHandle(handle) };
  if result.is_err() {
    return Err(napi_error(format!("TerminateProcess failed for pid {pid}")));
  }
  Ok(())
}

async fn close_app_internal(process_id: u32) -> Result<()> {
  if !is_process_running(process_id) {
    return Ok(());
  }

  for hwnd in discover_windows_for_pid(process_id, None) {
    // SAFETY: hwnd is a valid top-level window handle; WM_CLOSE is safe to broadcast.
    unsafe {
      let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
  }

  for _ in 0..40 {
    if !is_process_running(process_id) {
      return Ok(());
    }
    tokio::time::sleep(Duration::from_millis(50)).await;
  }

  if is_process_running(process_id) {
    terminate_process(process_id)?;
    for _ in 0..20 {
      if !is_process_running(process_id) {
        return Ok(());
      }
      tokio::time::sleep(Duration::from_millis(50)).await;
    }
    if is_process_running(process_id) {
      return Err(napi_error(format!("Process {process_id} did not exit after close")));
    }
  }

  Ok(())
}

#[napi]
pub async fn launch(
  executable_path: Option<String>,
  _class_names: Option<Vec<String>>,
) -> Result<u32> {
  info!("launch executable_path={executable_path:?}");
  let path = executable_path
    .ok_or_else(|| napi_error("executablePath is required"))?;

  let child = Command::new(&path)
    .spawn()
    .map_err(|err| napi_error(format!("Failed to launch process: {err}")))?;

  let child_pid = child.id();

  // Phase 1: Look for windows belonging to the spawned PID directly.
  // Handles normal Win32 apps where the process owns its own window.
  for _ in 0..30 {
    let found = {
      let windows = discover_windows_for_pid(child_pid, Some(&path));
      windows.first().map(|hwnd| window_pid(*hwnd)).filter(|pid| *pid != 0)
    };
    if let Some(owner_pid) = found {
      // Return the actual window-owning PID (handles ApplicationFrameHost scenarios)
      return Ok(owner_pid);
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
  }

  // Phase 2: For stub executables (e.g. calc.exe -> CalculatorApp via ApplicationFrameHost),
  // the spawned process has no windows itself. Scan ALL visible top-level windows and
  // find ones whose title contains the executable stem. Prefer ApplicationFrameWindow
  // (owned by ApplicationFrameHost.exe, directly reachable via UIA) over CoreWindow
  // (owned by the UWP app process, not a direct UIA root child).
  let stem: Option<String> = std::path::Path::new(&path)
    .file_stem()
    .map(|s| s.to_string_lossy().to_ascii_lowercase());

  for _ in 0..30 {
    tokio::time::sleep(Duration::from_millis(100)).await;
    let all = collect_all_top_level_windows();
    let candidates: Vec<HWND> = all.into_iter().filter(|hwnd| {
      if !is_visible(*hwnd) { return false; }
      let pid = window_pid(*hwnd);
      if pid == 0 || pid == child_pid { return false; }
      if let Some(ref stem) = stem {
        let title = get_window_title(*hwnd).to_ascii_lowercase();
        if title.contains(stem) { return true; }
      }
      false
    }).collect();

    if !candidates.is_empty() {
      // Prefer ApplicationFrameWindow over other window types
      let chosen_idx = candidates.iter().position(|hwnd| {
        get_class_name(*hwnd) == "ApplicationFrameWindow"
      }).unwrap_or(0);
      let chosen = candidates[chosen_idx];
      let owner_pid = window_pid(chosen);
      if owner_pid != 0 {
        return Ok(owner_pid);
      }
    }
  }

  Ok(child_pid)
}

/// Health check function exposed to Node.js.
#[napi]
pub fn ping() -> String {
  crate::trace::init_tracing();
  tracing::debug!("ping");
  "ok".to_string()
}

/// Discovers windows for a process and returns handles as strings.
#[napi(js_name = "enumerateWindows")]
pub async fn enumerate_windows(
  process_id: u32,
  executable: Option<String>,
) -> Result<Vec<String>> {
  let windows = crate::discovery::discover_windows_for_pid(process_id, executable.as_deref());
  Ok(windows.into_iter().map(crate::utils::hwnd_to_string).collect())
}

#[napi(js_name = "closeApp")]
pub async fn close_app(process_id: u32) -> Result<()> {
  close_app_internal(process_id).await
}

#[napi(js_name = "closeWindow")]
pub async fn close_window(window_handle: String) -> Result<()> {
  let hwnd = crate::utils::parse_hwnd(&window_handle)?;
  // SAFETY: COM is initialized via ComGuard; CoCreateInstance and UIA calls follow COM ABI rules.
  unsafe {
    let _com_init = crate::utils::ComGuard::init();
    // Try UIA WindowPattern.Close() first — works on UWP/modern windows
    let uia_result: windows::core::Result<IUIAutomation> = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER);
    if let Ok(automation) = uia_result {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationWindowPattern>(UIA_WindowPatternId) {
          let _ = pattern.Close();
          return Ok(());
        }
      }
    }
  }
  tracing::warn!("UIA WindowPattern.Close failed for hwnd={window_handle}, falling back to PostMessageW WM_CLOSE");
  // SAFETY: hwnd is a valid window handle; PostMessageW is inherently unsafe.
  unsafe {
    let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
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

  // SAFETY: CreateToolhelp32Snapshot returns a valid HANDLE; Process32FirstW/NextW mutate
  // the PROCESSENTRY32W buffer in-place. CloseHandle releases the snapshot on all paths.
  unsafe {
    let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
      Ok(s) => s,
      Err(_) => return Ok(entries),
    };

    let mut pe = PROCESSENTRY32W::default();
    pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    if Process32FirstW(snapshot, &mut pe).is_ok() {
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
        if Process32NextW(snapshot, &mut pe).is_err() {
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
    tokio::time::sleep(Duration::from_millis(50)).await;
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
