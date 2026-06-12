use napi::{Error, Result};
use napi_derive::napi;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_COMMAND, WM_SETTEXT};

use crate::error::AutomationError;
use crate::utils::{parse_hwnd, to_wide_null_terminated};

/// Send a WM_COMMAND message to a window (for legacy controls that only
/// respond to Win32 messages, not UIA).
#[napi(js_name = "sendWmCommand")]
pub fn send_wm_command(window_handle: String, control_id: i32, command_id: i32) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    SendMessageW(
      hwnd,
      WM_COMMAND,
      Some(WPARAM(((command_id & 0xFFFF) | ((control_id & 0xFFFF) << 16)) as usize)),
      Some(LPARAM(0)),
    );
  }
  Ok(())
}

/// Send a WM_SETTEXT message to set the text of a control (legacy fallback).
#[napi(js_name = "sendWmSetText")]
pub fn send_wm_set_text(control_handle: String, text: String) -> Result<()> {
  let hwnd = parse_hwnd(&control_handle)?;
  let wide_text = to_wide_null_terminated(&text);
  unsafe {
    SendMessageW(
      hwnd,
      WM_SETTEXT,
      Some(WPARAM(0)),
      Some(LPARAM(wide_text.as_ptr() as isize)),
    );
  }
  Ok(())
}

/// Send a WM_NOTIFY message to a window (for legacy control notifications).
#[napi(js_name = "sendWmNotify")]
pub fn send_wm_notify(_window_handle: String, _control_id: i32, _notification_code: i32) -> Result<()> {
  Err(Error::from(AutomationError::Generic {
    message: "WM_NOTIFY injection requires a more complete NMHDR structure. Use sendWmCommand instead.".into(),
  }))
}
