use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread;
use napi_derive::napi;
use windows::Win32::Foundation::{HANDLE, WAIT_EVENT};
use windows::Win32::System::Threading::{CreateEventW, SetEvent, WaitForSingleObject};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
  DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
};

/// Wrapper around HANDLE that implements Send + Sync.
#[derive(Clone, Copy)]
struct EventHandle(HANDLE);
unsafe impl Send for EventHandle {}
unsafe impl Sync for EventHandle {}

static CHANGE_EVENT: OnceLock<EventHandle> = OnceLock::new();
static SHUTDOWN_EVENT: OnceLock<EventHandle> = OnceLock::new();
static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

fn get_change_event() -> HANDLE {
  CHANGE_EVENT.get_or_init(|| {
    EventHandle(unsafe {
      CreateEventW(None, false, false, None).expect("CreateEventW for change event failed")
    })
  }).0
}

fn get_shutdown_event() -> HANDLE {
  SHUTDOWN_EVENT.get_or_init(|| {
    EventHandle(unsafe {
      CreateEventW(None, true, false, None).expect("CreateEventW for shutdown event failed")
    })
  }).0
}

/// WinEvent callback for EVENT_OBJECT_FOCUS (0x8005).
/// SAFETY: called by the OS on the hooking thread. We simply signal the change event.
unsafe extern "system" fn focus_event_proc(
  _hwin_event: HWINEVENTHOOK,
  _event: u32,
  _hwnd: windows::Win32::Foundation::HWND,
  _id_object: i32,
  _id_child: i32,
  _id_event_thread: u32,
  _dwms_time: u32,
) {
  let _ = SetEvent(get_change_event());
}

const EVENT_OBJECT_FOCUS: u32 = 0x8005;
const WINEVENT_OUTOFCONTEXT: u32 = 0x0000;

fn start_watcher() {
  if WATCHER_STARTED.swap(true, Ordering::SeqCst) {
    return;
  }

  // Create events first.
  let _change = get_change_event();
  let _shutdown = get_shutdown_event();

  let _ = thread::Builder::new()
    .name("uia-event-watcher".into())
    .spawn(move || {
      // SAFETY: The hook thread needs a message pump. STA COM is required for some
      // accessibility internals but SetWinEventHook itself does not need COM.
      let _ = unsafe { windows::Win32::System::Com::CoInitializeEx(
        None,
        windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
      ) };

      let hook: HWINEVENTHOOK = unsafe {
        SetWinEventHook(
          EVENT_OBJECT_FOCUS,
          EVENT_OBJECT_FOCUS,
          None,
          Some(focus_event_proc),
          0,
          0,
          WINEVENT_OUTOFCONTEXT,
        )
      };

      if hook.is_invalid() {
        tracing::error!("UIA watcher: SetWinEventHook failed");
        WATCHER_STARTED.store(false, Ordering::SeqCst);
        return;
      }

      tracing::info!("WinEvent focus-change watcher started");
      let mut msg = MSG::default();
      loop {
        // Check for shutdown every 50 ms (WAIT_OBJECT_0 == 0).
        if unsafe { WaitForSingleObject(get_shutdown_event(), 50) } == WAIT_EVENT(0) {
          break;
        }
        // Pump pending messages (WinEvent callbacks are dispatched here).
        while unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) }.as_bool() {
          unsafe {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
          }
        }
      }

      // Clean up the hook.
      unsafe { let _ = UnhookWinEvent(hook); }
      WATCHER_STARTED.store(false, Ordering::SeqCst);
    });
}

/// Blocks for up to `timeout_ms` waiting for a UI focus-change event.
/// Returns `true` if a change was detected, `false` on timeout.
#[napi(js_name = "waitForUiChange")]
pub async fn wait_for_ui_change(timeout_ms: i32) -> bool {
  start_watcher();
  let timeout = std::cmp::max(timeout_ms, 1) as u32;
  let signaled = tokio::task::spawn_blocking(move || unsafe {
    WaitForSingleObject(get_change_event(), timeout) == WAIT_EVENT(0)
  })
  .await
  .unwrap_or(false);
  signaled
}
