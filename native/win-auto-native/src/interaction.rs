use napi::{Result};
use napi_derive::napi;
use windows::core::{BSTR, VARIANT};
use windows::Win32::Foundation::{LPARAM, RECT, WPARAM};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Accessibility::{PropertyConditionFlags, PropertyConditionFlags_MatchSubstring, PropertyConditionFlags_IgnoreCase, TreeScope_Descendants, UIA_NamePropertyId};
use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, MOUSEINPUT, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSE_EVENT_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, SendMessageW, SetForegroundWindow, SetCursorPos, WM_HSCROLL, WM_SETTEXT, WM_VSCROLL};

use crate::config::get_config;
use crate::discovery::{create_uia, find_child_window_by_text, find_element_hwnd, find_element_uia};
use crate::error::napi_error;
use crate::utils::{get_window_title, is_probable_notepad_window, parse_hwnd, to_wide_null_terminated};

#[napi(js_name = "findElement")]
pub async fn find_element(
  window_handle: String,
  class_names: Option<Vec<String>>,
  _automation_id: Option<String>,
  name: Option<String>,
  _role: Option<String>,
) -> Result<Option<String>> {
  let classes = if let Some(c) = class_names {
    c
  } else {
    get_config()
      .map(|config| config.class_names)
      .unwrap_or_default()
  };

  let hwnd = parse_hwnd(&window_handle)?;

  if !classes.is_empty() {
    if let Some(element_hwnd) = find_element_hwnd(hwnd, &classes) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
  }

  if let Some(ref query_name) = name {
    if let Some(element_hwnd) = find_child_window_by_text(hwnd, query_name) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
    if let Some(element_hwnd) = find_element_uia(hwnd, query_name) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
  }

  if is_probable_notepad_window(hwnd) {
    return Ok(Some(window_handle));
  }

  Ok(None)
}

#[napi(js_name = "typeText")]
pub async fn type_text(element_handle: String, text: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let wide = to_wide_null_terminated(&text);
  unsafe {
    SendMessageW(hwnd, WM_SETTEXT, WPARAM(0), LPARAM(wide.as_ptr() as isize));
  }
  Ok(())
}

fn send_unicode_input(code_point: u16, flags: u32) {
  let input = INPUT {
    r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
    Anonymous: INPUT_0 {
      ki: KEYBDINPUT {
        wVk: VIRTUAL_KEY(0),
        wScan: code_point,
        dwFlags: KEYBD_EVENT_FLAGS(flags),
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
  unsafe {
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
  }
}

#[napi(js_name = "sendKeys")]
pub async fn send_keys(element_handle: String, text: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = SetForegroundWindow(hwnd);
    std::thread::sleep(std::time::Duration::from_millis(10));
  }

  for code_point in text.encode_utf16() {
    send_unicode_input(code_point, KEYEVENTF_UNICODE.0);
    send_unicode_input(code_point, KEYEVENTF_UNICODE.0 | KEYEVENTF_KEYUP.0);
  }

  Ok(())
}

#[napi(js_name = "getText")]
pub async fn get_text(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  Ok(get_window_title(hwnd))
}

#[napi(js_name = "findElementName")]
pub async fn find_element_name(window_handle: String, name: String) -> Result<Option<String>> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let root = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA root from handle: {err}")))?;
    let query_lower = name.to_ascii_lowercase();
    let condition_flags = PropertyConditionFlags(
      PropertyConditionFlags_MatchSubstring.0 | PropertyConditionFlags_IgnoreCase.0,
    );

    let value: VARIANT = BSTR::from(name.clone()).into();
    let condition = automation
      .CreatePropertyConditionEx(
        UIA_NamePropertyId,
        &value,
        condition_flags,
      )
      .map_err(|err| napi_error(format!("Failed to create UIA name condition: {err}")))?;

    let element = root.FindFirst(TreeScope_Descendants, &condition).map_err(|err| napi_error(format!("Failed to find UIA element by name: {err}")))?;
    let current_name = element
      .CurrentName()
      .map_err(|err| napi_error(format!("Failed to read UIA element CurrentName: {err}")))?
      .to_string();

    if current_name.is_empty() || !current_name.to_ascii_lowercase().contains(&query_lower) {
      return Ok(None);
    }

    Ok(Some(current_name))
  }
}

#[napi(js_name = "hoverElement")]
pub async fn hover_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(napi_error("Failed to get window rectangle"));
    }
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    SetCursorPos(center_x, center_y).map_err(|_| napi_error("Failed to set cursor position"))?;
  }
  Ok(())
}

#[napi(js_name = "scrollElement")]
pub async fn scroll_element(element_handle: String, direction: String, amount: i32) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let (wparam, msg) = match direction.as_str() {
    "up" => (WPARAM(0), WM_VSCROLL),
    "down" => (WPARAM(1), WM_VSCROLL),
    "left" => (WPARAM(0), WM_HSCROLL),
    "right" => (WPARAM(1), WM_HSCROLL),
    _ => return Err(napi_error(format!("Invalid scroll direction: {direction}"))),
  };

  unsafe {
    for _ in 0..amount {
      SendMessageW(hwnd, msg, wparam, LPARAM(0));
    }
  }
  Ok(())
}

fn make_mouse_input(flags: u32) -> INPUT {
  INPUT {
    r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_MOUSE,
    Anonymous: INPUT_0 {
      mi: MOUSEINPUT {
        dx: 0,
        dy: 0,
        mouseData: 0,
        dwFlags: MOUSE_EVENT_FLAGS(flags),
        time: 0,
        dwExtraInfo: 0,
      },
    },
  }
}

#[napi(js_name = "dragDrop")]
pub async fn drag_drop(from_element_handle: String, to_element_handle: String) -> Result<()> {
  let from_hwnd = parse_hwnd(&from_element_handle)?;
  let to_hwnd = parse_hwnd(&to_element_handle)?;

  unsafe {
    let mut from_rect = RECT::default();
    if GetWindowRect(from_hwnd, &mut from_rect).is_err() {
      return Err(napi_error("Failed to get source window rectangle"));
    }
    let from_x = (from_rect.left + from_rect.right) / 2;
    let from_y = (from_rect.top + from_rect.bottom) / 2;

    let mut to_rect = RECT::default();
    if GetWindowRect(to_hwnd, &mut to_rect).is_err() {
      return Err(napi_error("Failed to get target window rectangle"));
    }
    let to_x = (to_rect.left + to_rect.right) / 2;
    let to_y = (to_rect.top + to_rect.bottom) / 2;

    SetCursorPos(from_x, from_y).map_err(|_| napi_error("Failed to position cursor"))?;
    SendInput(&[make_mouse_input(MOUSEEVENTF_LEFTDOWN.0)], std::mem::size_of::<INPUT>() as i32);
    std::thread::sleep(std::time::Duration::from_millis(100));
    SetCursorPos(to_x, to_y).map_err(|_| napi_error("Failed to position cursor"))?;
    SendInput(&[make_mouse_input(MOUSEEVENTF_MOVE.0)], std::mem::size_of::<INPUT>() as i32);
    std::thread::sleep(std::time::Duration::from_millis(100));
    SendInput(&[make_mouse_input(MOUSEEVENTF_LEFTUP.0)], std::mem::size_of::<INPUT>() as i32);
  }

  Ok(())
}
