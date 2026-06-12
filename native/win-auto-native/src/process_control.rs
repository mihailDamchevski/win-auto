use std::sync::Mutex;
use std::time::Duration;
use napi::{Error, Result};
use napi_derive::napi;
use tracing::info;
use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
use windows::Win32::System::JobObjects::*;
use windows::Win32::System::Threading::*;
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationWindowPattern, UIA_WindowPatternId};
use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
use windows::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Threading::{OpenProcessToken, GetProcessId};

use crate::discovery::{collect_all_top_level_windows, discover_windows_for_pid};
use crate::error::AutomationError;
use crate::utils::{get_class_name, get_window_title, is_visible, process_image_for_pid, window_pid};

// ── Job-object registry ───────────────────────────────────────────────────
// Keeps job handles alive so child processes stay bound to the job.
// isize (raw pointer value) is Send, unlike HANDLE (*mut c_void).

static JOB_HANDLES: std::sync::LazyLock<Mutex<Vec<isize>>> =
  std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

fn create_job_object() -> std::result::Result<HANDLE, AutomationError> {
  unsafe {
    let job = CreateJobObjectW(None, None).map_err(|_| AutomationError::Generic {
      message: "failed to create job object".into(),
    })?;

    let info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
      BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION {
        LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
          | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
        ..Default::default()
      },
      ..Default::default()
    };

    SetInformationJobObject(
      job,
      JobObjectExtendedLimitInformation,
      &info as *const _ as *const std::ffi::c_void,
      std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
    )
    .map_err(|_| AutomationError::Generic {
      message: "failed to set job object info".into(),
    })?;

    let mut list = JOB_HANDLES.lock().unwrap();
    list.push(job.0 as isize);

    Ok(job)
  }
}

// ── Process helpers ───────────────────────────────────────────────────────

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
    return Err(Error::from(AutomationError::ProcessLaunchFailed { path: format!("pid {pid}"), os_error: 0 }));
  }
  Ok(())
}

// ── CreateProcessW launcher ───────────────────────────────────────────────

/// Spawn a process via `CreateProcessW`, optionally attach it to a job object,
/// and return the PID.  The calling thread must be on an STA for COM-based
/// window discovery afterwards.
fn spawn_process_via_createprocess(
  path: &str,
  args: Option<&[String]>,
  cwd: Option<&str>,
  env: Option<&[String]>,
  job: bool,
  create_no_window: bool,
) -> std::result::Result<u32, AutomationError> {
  // Build command-line string (CreateProcessW expects a mutable buffer).
  let mut cmdline = path.to_string();
  if let Some(a) = args {
    for arg in a {
      cmdline.push(' ');
      cmdline.push_str(arg);
    }
  }

  // Environment block: "KEY=VALUE\0KEY=VALUE\0\0"
  let env_block: Option<Vec<u16>> = env.map(|vars| {
    let mut block = Vec::new();
    for var in vars {
      for c in var.encode_utf16() {
        block.push(c);
      }
      block.push(0u16);
    }
    block.push(0u16); // double null
    block
  });

  // Current directory as wide string.
  let cwd_wide: Option<Vec<u16>> = cwd.map(|s| {
    s.encode_utf16().chain(std::iter::once(0)).collect()
  });

  // Job object (keep alive via static registry).
  let job_handle = if job { Some(create_job_object()?) } else { None };

  let mut creation_flags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT;
  if create_no_window {
    creation_flags = creation_flags | DETACHED_PROCESS;
  } else if job {
    creation_flags = creation_flags | CREATE_NEW_CONSOLE;
  }

  unsafe {
    let mut si = STARTUPINFOW::default();
    si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;

    let mut pi = PROCESS_INFORMATION::default();

    let mut cmdline_wide = cmdline.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let cmdline_pwstr = PWSTR(cmdline_wide.as_mut_ptr());

    let env_ptr: Option<*const std::ffi::c_void> = env_block
      .as_ref()
      .map(|b| b.as_ptr() as *const std::ffi::c_void);

    let cwd_ptr: PCWSTR = cwd_wide
      .as_ref()
      .map(|v| PCWSTR(v.as_ptr()))
      .unwrap_or(PCWSTR::null());

    CreateProcessW(
      PCWSTR::null(),     // lpApplicationName – null = use command line
      Some(cmdline_pwstr), // lpCommandLine
      None,               // lpProcessAttributes
      None,               // lpThreadAttributes
      false,              // bInheritHandles
      creation_flags,
      env_ptr,
      cwd_ptr,
      &mut si,
      &mut pi,
    )
    .map_err(|e| AutomationError::ProcessLaunchFailed {
      path: path.to_string(),
      os_error: e.code().0,
    })?;

    let pid = pi.dwProcessId;

    // Assign to job object while still suspended (if requested).
    if let Some(ref jh) = job_handle {
      let _ = AssignProcessToJobObject(*jh, pi.hProcess);
    }

    // Resume the main thread.
    ResumeThread(pi.hThread);

    // Close local handles – the job keeps the process alive.
    let _ = CloseHandle(pi.hThread);
    let _ = CloseHandle(pi.hProcess);

    Ok(pid)
  }
}

// ── Elevation helpers ─────────────────────────────────────────────────────

/// Check whether a given process is running elevated (admin).
fn is_process_elevated_rust(pid: u32) -> Result<bool> {
  if pid == 0 {
    return Ok(false);
  }

  unsafe {
    let process = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid);
    let Ok(handle) = process else {
      return Ok(false);
    };
    if handle.is_invalid() {
      return Ok(false);
    }

    let mut token_handle = HANDLE::default();
    if OpenProcessToken(handle, TOKEN_QUERY, &mut token_handle).is_err() {
      let _ = CloseHandle(handle);
      return Ok(false);
    }

    let mut elevation = TOKEN_ELEVATION::default();
    let mut return_length = 0u32;
    let result = GetTokenInformation(
      token_handle,
      windows::Win32::Security::TokenElevation,
      Some(&mut elevation as *mut _ as *mut std::ffi::c_void),
      std::mem::size_of::<TOKEN_ELEVATION>() as u32,
      &mut return_length,
    );

    let _ = CloseHandle(token_handle);
    let _ = CloseHandle(handle);

    match result {
      Ok(()) => Ok(elevation.TokenIsElevated != 0),
      Err(_) => Ok(false),
    }
  }
}

/// Launch a process elevated (admin) using ShellExecuteExW with "runas" verb.
/// Returns the PID of the spawned process.
fn run_elevated_rust(
  path: &str,
  args: Option<&[String]>,
  cwd: Option<&str>,
) -> std::result::Result<u32, AutomationError> {
  let mut cmdline = String::new();
  if let Some(a) = args {
    for arg in a {
      if !cmdline.is_empty() { cmdline.push(' '); }
      cmdline.push_str(arg);
    }
  }

  let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
  let args_wide: Vec<u16> = if cmdline.is_empty() {
    vec![0u16]
  } else {
    cmdline.encode_utf16().chain(std::iter::once(0)).collect()
  };
  let cwd_wide: Vec<u16> = cwd
    .map(|s| s.encode_utf16().chain(std::iter::once(0)).collect())
    .unwrap_or_else(|| vec![0u16]);

  unsafe {
    let mut info = SHELLEXECUTEINFOW {
      cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
      fMask: SEE_MASK_NOCLOSEPROCESS,
      hwnd: HWND::default(),
      lpVerb: windows::core::w!("runas"),
      lpFile: PCWSTR::from_raw(path_wide.as_ptr()),
      lpParameters: PCWSTR::from_raw(args_wide.as_ptr()),
      lpDirectory: PCWSTR::from_raw(cwd_wide.as_ptr()),
      nShow: windows::Win32::UI::WindowsAndMessaging::SW_SHOWDEFAULT.0,
      hProcess: windows::Win32::Foundation::HANDLE::default(),
      ..Default::default()
    };

    ShellExecuteExW(&mut info).map_err(|e: windows::core::Error| AutomationError::ProcessLaunchFailed {
      path: path.to_string(),
      os_error: e.code().0,
    })?;

    if info.hProcess.is_invalid() {
      return Err(AutomationError::ProcessLaunchFailed {
        path: path.to_string(),
        os_error: 0,
      });
    }

    let pid = GetProcessId(info.hProcess);
    let _ = CloseHandle(info.hProcess);

    if pid == 0 {
      Err(AutomationError::ProcessLaunchFailed {
        path: path.to_string(),
        os_error: 0,
      })
    } else {
      Ok(pid)
    }
  }
}

// ── Close-app helper ──────────────────────────────────────────────────────

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
      return Err(Error::from(AutomationError::ProcessLaunchFailed { path: format!("Process {process_id}"), os_error: 0 }));
    }
  }

  Ok(())
}

// ── Napi exports ──────────────────────────────────────────────────────────

#[napi(object)]
pub struct LaunchOptions {
  pub args: Option<Vec<String>>,
  pub cwd: Option<String>,
  pub env: Option<Vec<String>>,
  /// If "admin", spawn the process elevated (triggers UAC prompt).
  pub run_as: Option<String>,
  /// Attach process to a job object so it's killed when the parent exits.
  pub job: Option<bool>,
  /// If true, don't create a console window (DETACHED_PROCESS).
  pub create_no_window: Option<bool>,
  /// AUMID for UWP app activation (alternative to executablePath).
  pub aumid: Option<String>,
}

/// High-level launch — replaces the old `std::process::Command` approach.
/// Returns the PID of the spawned process (or the window-owning PID for
/// ApplicationFrameHost scenarios).
#[napi]
pub async fn launch(
  executable_path: Option<String>,
  _class_names: Option<Vec<String>>,
) -> Result<u32> {
  info!("launch executable_path={executable_path:?}");
  let path = executable_path
    .ok_or_else(|| Error::from(AutomationError::Generic { message: "executablePath is required".into() }))?;

  let child_pid = spawn_process_via_createprocess(&path, None, None, None, true, false)
    .map_err(|e| Error::from(e))?;

  // Phase 1: Look for windows belonging to the spawned PID directly.
  for _ in 0..30 {
    let found = {
      let windows = discover_windows_for_pid(child_pid, Some(&path));
      windows.first().map(|hwnd| window_pid(*hwnd)).filter(|pid| *pid != 0)
    };
    if let Some(owner_pid) = found {
      return Ok(owner_pid);
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
  }

  // Phase 2: Scan visible top-level windows for the executable stem.
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

/// Full-featured launch with options (args, cwd, env).
#[napi(js_name = "launchProcess")]
pub async fn launch_process(
  executable_path: String,
  options: Option<LaunchOptions>,
) -> Result<u32> {
  info!("launchProcess path={executable_path}");

  let opts = options.unwrap_or(LaunchOptions {
    args: None,
    cwd: None,
    env: None,
    run_as: None,
    job: None,
    create_no_window: None,
    aumid: None,
  });

  // If run_as is "admin", use elevated launch path
  if opts.run_as.as_deref() == Some("admin") {
    let child_pid = run_elevated_rust(
      &executable_path,
      opts.args.as_deref(),
      opts.cwd.as_deref(),
    )
    .map_err(|e| Error::from(e))?;
    return Ok(child_pid);
  }

  let use_job = opts.job.unwrap_or(true);
  let no_window = opts.create_no_window.unwrap_or(false);

  let child_pid = spawn_process_via_createprocess(
    &executable_path,
    opts.args.as_deref(),
    opts.cwd.as_deref(),
    opts.env.as_deref(),
    use_job,
    no_window,
  )
  .map_err(|e| Error::from(e))?;

  let stem: Option<String> = std::path::Path::new(&executable_path)
    .file_stem()
    .map(|s| s.to_string_lossy().to_ascii_lowercase());

  // Phase 1: windows owned by spawned PID
  for _ in 0..30 {
    let found = {
      let windows = discover_windows_for_pid(child_pid, Some(&executable_path));
      windows.first().map(|hwnd| window_pid(*hwnd)).filter(|pid| *pid != 0)
    };
    if let Some(owner_pid) = found {
      return Ok(owner_pid);
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
  }

  // Phase 2: scan all visible top-level windows
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
  // SAFETY: COM is initialized via ComScope; CoCreateInstance and UIA calls follow COM ABI rules.
  unsafe {
    let _com_init = crate::utils::ComScope::init();
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

#[napi(js_name = "isProcessElevated")]
pub fn is_process_elevated_export(process_id: u32) -> Result<bool> {
  is_process_elevated_rust(process_id)
}

/// Launch a process elevated (admin) via ShellExecuteExW with "runas" verb.
/// Returns the PID of the spawned process.
#[napi(js_name = "runElevated")]
pub async fn run_elevated_export(
  executable_path: String,
  args: Option<Vec<String>>,
  cwd: Option<String>,
) -> Result<u32> {
  run_elevated_rust(&executable_path, args.as_deref(), cwd.as_deref())
    .map_err(|e| Error::from(e))
}

/// Launch a UWP app by its AUMID (Application User Model ID) using
/// IApplicationActivationManager::ActivateApplication.
/// Returns the PID of the activated process.
#[napi(js_name = "launchAppByAumid")]
pub fn launch_app_by_aumid(aumid: String) -> Result<u32> {
  unsafe {
    let _com = crate::utils::ComScope::init();

    // IApplicationActivationManager CLSID
    let clsid = windows::core::GUID::zeroed();
    // CLSID_ApplicationActivationManager
    let clsid_activate = windows::core::GUID {
      data1: 0x45BA127D,
      data2: 0x10A8,
      data3: 0x46EA,
      data4: [0x8A, 0xB7, 0x56, 0xEA, 0x90, 0x78, 0x94, 0x3C],
    };
    // IID_IApplicationActivationManager
    let iid_activate = windows::core::GUID {
      data1: 0x00000035,
      data2: 0x0000,
      data3: 0x0000,
      data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };

    let activate_manager: windows::core::Result<IUnknown> = CoCreateInstance(
      &clsid_activate,
      None,
      CLSCTX_INPROC_SERVER,
    );
    match activate_manager {
      Ok(unk) => {
        // Try to query for IApplicationActivationManager
        let app_activate: windows::core::Result<windows::Win32::UI::Shell::IApplicationActivationManager> =
          unk.cast();
        if let Ok(manager) = app_activate {
          let aumid_wide: Vec<u16> = aumid.encode_utf16().chain(std::iter::once(0)).collect();
          let pid = manager.ActivateApplication(
            windows::core::PCWSTR(aumid_wide.as_ptr()),
            windows::core::PCWSTR::null(),
            windows::Win32::UI::Shell::ACTIVATEOPTIONS(0),
          );
          if let Ok(pid) = pid {
            if pid > 0 {
              return Ok(pid);
            }
          }
        }
        Err(Error::from(AutomationError::Generic {
          message: format!("IApplicationActivationManager failed for AUMID: {aumid}"),
        }))
      }
      Err(e) => Err(Error::from(AutomationError::Generic {
        message: format!("CoCreateInstance IApplicationActivationManager failed: {e}"),
      })),
    }
  }
}
