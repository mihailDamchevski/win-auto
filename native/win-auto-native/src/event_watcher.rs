use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use napi::threadsafe_function::{ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Env, JsFunction, Result};
use napi_derive::napi;
use windows::Win32::Foundation::{HANDLE, WAIT_EVENT};
use windows::Win32::System::Threading::{CreateEventW, SetEvent, WaitForSingleObject};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
  DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
};

const EVENT_OBJECT_CREATE: u32 = 0x8000;
const EVENT_OBJECT_DESTROY: u32 = 0x8001;
const EVENT_OBJECT_SHOW: u32 = 0x8002;
const EVENT_OBJECT_HIDE: u32 = 0x8003;
const EVENT_OBJECT_FOCUS: u32 = 0x8005;
const EVENT_OBJECT_VALUECHANGE: u32 = 0x800E;
const EVENT_SYSTEM_MENUSTART: u32 = 0x0004;
const EVENT_SYSTEM_MENUEND: u32 = 0x0005;
const WINEVENT_OUTOFCONTEXT: u32 = 0x0000;

const ALL_EVENTS: &[u32] = &[
  EVENT_OBJECT_CREATE,
  EVENT_OBJECT_DESTROY,
  EVENT_OBJECT_SHOW,
  EVENT_OBJECT_HIDE,
  EVENT_OBJECT_FOCUS,
  EVENT_OBJECT_VALUECHANGE,
  EVENT_SYSTEM_MENUSTART,
  EVENT_SYSTEM_MENUEND,
];

#[derive(Clone)]
#[napi(object)]
pub struct WinEventInfo {
  pub event_type: u32,
  pub hwnd: String,
  pub id_object: i32,
  pub id_child: i32,
  pub id_event_thread: u32,
  pub timestamp: u32,
}

#[derive(Clone, Copy)]
struct EventHandle(HANDLE);
unsafe impl Send for EventHandle {}
unsafe impl Sync for EventHandle {}

static CHANGE_EVENT: OnceLock<EventHandle> = OnceLock::new();
static SHUTDOWN_EVENT: OnceLock<EventHandle> = OnceLock::new();
static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

type EventCallback = ThreadsafeFunction<WinEventInfo>;
static WIN_EVENT_CALLBACK: OnceLock<Mutex<Option<EventCallback>>> = OnceLock::new();

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

fn get_callback_mutex() -> &'static Mutex<Option<EventCallback>> {
  WIN_EVENT_CALLBACK.get_or_init(|| Mutex::new(None))
}

/// WinEvent callback hooked for all events in ALL_EVENTS.
/// SAFETY: called by the OS on the hooking thread.
unsafe extern "system" fn win_event_proc(
  _hwin_event: HWINEVENTHOOK,
  event: u32,
  hwnd: windows::Win32::Foundation::HWND,
  id_object: i32,
  id_child: i32,
  id_event_thread: u32,
  dwms_time: u32,
) {
  let _ = SetEvent(get_change_event());

  if let Ok(guard) = get_callback_mutex().lock() {
    if let Some(ref tsfn) = *guard {
      let info = WinEventInfo {
        event_type: event,
        hwnd: format!("{:x}", hwnd.0 as usize),
        id_object,
        id_child,
        id_event_thread,
        timestamp: dwms_time,
      };
      let _ = tsfn.call(Ok(info), ThreadsafeFunctionCallMode::NonBlocking);
    }
  }
}

fn start_watcher() {
  if WATCHER_STARTED.swap(true, Ordering::SeqCst) {
    return;
  }

  let _change = get_change_event();
  let _shutdown = get_shutdown_event();

  let _ = thread::Builder::new()
    .name("uia-event-watcher".into())
    .spawn(move || {
      let _ = unsafe { windows::Win32::System::Com::CoInitializeEx(
        None,
        windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
      ) };

      let min_event = ALL_EVENTS.iter().min().copied().unwrap();
      let max_event = ALL_EVENTS.iter().max().copied().unwrap();

      let hook: HWINEVENTHOOK = unsafe {
        SetWinEventHook(
          min_event,
          max_event,
          None,
          Some(win_event_proc),
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

      tracing::info!(
        "WinEvent watcher started (events {:#x}–{:#x})",
        min_event,
        max_event
      );
      let mut msg = MSG::default();
      loop {
        if unsafe { WaitForSingleObject(get_shutdown_event(), 50) } == WAIT_EVENT(0) {
          break;
        }
        while unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) }.as_bool() {
          unsafe {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
          }
        }
      }

      unsafe { let _ = UnhookWinEvent(hook); }
      WATCHER_STARTED.store(false, Ordering::SeqCst);
    });
}

/// Blocks for up to `timeout_ms` waiting for a UI event.
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

/// Start the WinEvent watcher with a JS callback invoked on each WinEvent.
/// The callback receives a WinEventInfo object. Call `stopWinEventWatcher`
/// to unregister the callback. The underlying hook thread runs for the
/// lifetime of the process (or until stopWinEventWatcher is called).
#[napi(js_name = "startWinEventWatcher")]
pub fn start_win_event_watcher(env: Env, callback: JsFunction) -> Result<()> {
  start_watcher();

  let tsfn: EventCallback = env.create_threadsafe_function(
    &callback,
    0,
    |ctx: ThreadSafeCallContext<WinEventInfo>| {
      let info = ctx.value;
      let mut obj = ctx.env.create_object()?;
      obj.set_named_property("eventType", ctx.env.create_uint32(info.event_type)?)?;
      obj.set_named_property("hwnd", ctx.env.create_string_from_std(info.hwnd)?)?;
      obj.set_named_property("idObject", ctx.env.create_int32(info.id_object)?)?;
      obj.set_named_property("idChild", ctx.env.create_int32(info.id_child)?)?;
      obj.set_named_property("idEventThread", ctx.env.create_uint32(info.id_event_thread)?)?;
      obj.set_named_property("timestamp", ctx.env.create_uint32(info.timestamp)?)?;
      Ok(vec![obj])
    },
  )?;

  *get_callback_mutex().lock().map_err(|_| {
    napi::Error::new(
      napi::Status::GenericFailure,
      "Failed to lock callback mutex",
    )
  })? = Some(tsfn);

  tracing::info!("WinEvent JS callback registered");
  Ok(())
}

/// Unregister the WinEvent JS callback. The underlying hook thread continues
/// running (for `waitForUiChange`), but no further JS callbacks are made.
#[napi(js_name = "stopWinEventWatcher")]
pub fn stop_win_event_watcher() -> Result<()> {
  *get_callback_mutex().lock().map_err(|_| {
    napi::Error::new(
      napi::Status::GenericFailure,
      "Failed to lock callback mutex",
    )
  })? = None;

  tracing::info!("WinEvent JS callback unregistered");
  Ok(())
}
