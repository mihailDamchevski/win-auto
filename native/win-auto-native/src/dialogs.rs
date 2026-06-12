use napi::{Error, Result};
use napi_derive::napi;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{
  INPUT, INPUT_0, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, SendInput, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, SetForegroundWindow, ShowWindow, SW_NORMAL};

use crate::discovery::collect_windows_for_pid;
use crate::error::AutomationError;
use crate::interaction::click_element;
use crate::utils::{get_class_name, get_window_title, hwnd_to_string, is_visible, parse_hwnd};

const DIALOG_CLASS: &str = "#32770";

#[napi(object)]
pub struct DialogInfo {
  pub handle: String,
  pub title: String,
  pub class_name: String,
  pub visible: bool,
  /// "standard" for #32770, "directui" for DirectUIHWND, "uwp" for Windows.UI.Core.CoreWindow
  pub dialog_type: String,
}

/// Detect whether a window is a DirectUIHWND or UWP CoreWindow.
fn get_dialog_type(hwnd: HWND) -> String {
  let class_name = get_class_name(hwnd);
  if class_name == "#32770" {
    "standard".to_string()
  } else if class_name == "DirectUIHWND" {
    "directui".to_string()
  } else if class_name.contains("Windows.UI.Core.CoreWindow") {
    "uwp".to_string()
  } else {
    "standard".to_string()
  }
}

#[napi(js_name = "detectDialogType")]
pub fn detect_dialog_type(window_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&window_handle)?;
  Ok(get_dialog_type(hwnd))
}

#[napi(object)]
pub struct DialogControl {
  pub handle: String,
  pub name: String,
  pub control_type: String,
}

fn is_dialog_window(hwnd: HWND) -> bool {
  let class_name = get_class_name(hwnd);
  class_name == DIALOG_CLASS
}

#[napi(js_name = "findDialogs")]
pub fn find_dialogs(process_id: u32) -> Result<Vec<DialogInfo>> {
  let windows = collect_windows_for_pid(process_id);
  let mut dialogs = Vec::new();
  for hwnd in windows {
    let class_name = get_class_name(hwnd);
    if class_name == "#32770" || class_name == "DirectUIHWND" || class_name.contains("Windows.UI.Core") {
      dialogs.push(DialogInfo {
        handle: hwnd_to_string(hwnd),
        title: get_window_title(hwnd),
        class_name: class_name.clone(),
        visible: is_visible(hwnd),
        dialog_type: get_dialog_type(hwnd),
      });
    }
  }
  Ok(dialogs)
}

#[napi(js_name = "getDialogControls")]
pub fn get_dialog_controls(window_handle: String) -> Result<Vec<DialogControl>> {
  let hwnd = parse_hwnd(&window_handle)?;
  let mut controls = Vec::new();

  // SAFETY: hwnd is a valid dialog HWND from parse_hwnd; FindWindowExW enumerates child windows.
  unsafe {
    let mut child = FindWindowExW(Some(hwnd), None, None, None).ok();
    while let Some(current) = child {
      if current.is_invalid() {
        break;
      }
      let class_name = get_class_name(current);
      if !class_name.is_empty() {
        let title = get_window_title(current);
        let control_type = if class_name.eq_ignore_ascii_case("Button") {
          "button"
        } else if class_name.eq_ignore_ascii_case("Edit") {
          "textbox"
        } else if class_name.eq_ignore_ascii_case("Static") {
          "label"
        } else if class_name.eq_ignore_ascii_case("ComboBox") {
          "combobox"
        } else if class_name.eq_ignore_ascii_case("ListBox") {
          "listbox"
        } else {
          &class_name
        };
        controls.push(DialogControl {
          handle: hwnd_to_string(current),
          name: title,
          control_type: control_type.to_string(),
        });
      }

      let nested = FindWindowExW(Some(current), None, None, None).ok();
      if let Some(nested_hwnd) = nested {
        if !nested_hwnd.is_invalid() {
          let nested_class = get_class_name(nested_hwnd);
          if !nested_class.is_empty() {
            let nested_title = get_window_title(nested_hwnd);
            let ctype = if nested_class.eq_ignore_ascii_case("Button") {
              "button"
            } else {
              &nested_class
            };
            controls.push(DialogControl {
              handle: hwnd_to_string(nested_hwnd),
              name: nested_title,
              control_type: ctype.to_string(),
            });
          }
        }
      }

      child = FindWindowExW(Some(hwnd), Some(current), None, None).ok();
    }
  }

  Ok(controls)
}

#[napi(js_name = "clickDialogButton")]
pub async fn click_dialog_button(window_handle: String, button_text: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;

  // SAFETY: hwnd is a valid window handle; ShowWindow and SetForegroundWindow may fail
  // silently (returns ignored) for windows from other security contexts.
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(100)).await;

  let controls = get_dialog_controls(window_handle)?;
  let query_lower = button_text.to_ascii_lowercase();

  for control in &controls {
    if control.control_type == "button" {
      let name_lower = control.name.to_ascii_lowercase();
      if name_lower == query_lower || name_lower.contains(&query_lower) {
        click_element(control.handle.clone(), None).await?;
        return Ok(());
      }
    }
  }

  Err(Error::from(AutomationError::DialogFailed { message: format!("No button with text '{button_text}' found in dialog") }))
}

#[napi(js_name = "setDialogFilePath")]
pub async fn set_dialog_file_path(window_handle: String, path: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;

  // SAFETY: hwnd is a valid window handle; ShowWindow and SetForegroundWindow may fail silently.
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(200)).await;

  let controls = get_dialog_controls(window_handle.clone())?;

  // Helper: type text into the focused control via SendInput (no WM_SETTEXT).
  async fn type_text_keystrokes(text: &str) {
    let mut inputs = Vec::with_capacity(text.encode_utf16().count() * 2);
    for cp in text.encode_utf16() {
      inputs.push(INPUT {
        r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
          ki: KEYBDINPUT {
            wVk: VIRTUAL_KEY(0),
            wScan: cp,
            dwFlags: KEYEVENTF_UNICODE,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      });
      inputs.push(INPUT {
        r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
          ki: KEYBDINPUT {
            wVk: VIRTUAL_KEY(0),
            wScan: cp,
            dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      });
    }
    // SAFETY: properly initialized INPUT structures for Unicode keyboard input.
    unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32); }
  }

  // Find the ComboBoxEx32 (filename field in Vista+ file dialogs).
  // Type the text via keystroke simulation — WM_SETTEXT can confuse the control.
  for control in &controls {
    if control.control_type.eq_ignore_ascii_case("ComboBoxEx32") {
      type_text_keystrokes(&path).await;
      return Ok(());
    }
  }
  // Fallback: type into the first textbox/Edit control.
  for control in &controls {
    if control.control_type == "textbox" || control.control_type.eq_ignore_ascii_case("Edit") {
      type_text_keystrokes(&path).await;
      return Ok(());
    }
  }

  Err(Error::from(AutomationError::DialogFailed { message: format!("No text input control found in file dialog for window {window_handle}") }))
}
