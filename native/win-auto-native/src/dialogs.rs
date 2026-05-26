use std::ptr::null_mut;
use napi::{Result};
use napi_derive::napi;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, SetForegroundWindow, ShowWindow, SW_NORMAL};

use crate::discovery::collect_windows_for_pid;
use crate::error::napi_error;
use crate::interaction::click_element;
use crate::utils::{get_class_name, get_window_title, hwnd_to_string, is_visible, parse_hwnd};

const DIALOG_CLASS: &str = "#32770";

#[napi(object)]
pub struct DialogInfo {
  pub handle: String,
  pub title: String,
  pub class_name: String,
  pub visible: bool,
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
    if is_dialog_window(hwnd) {
      dialogs.push(DialogInfo {
        handle: hwnd_to_string(hwnd),
        title: get_window_title(hwnd),
        class_name: DIALOG_CLASS.to_string(),
        visible: is_visible(hwnd),
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
    let mut child = FindWindowExW(hwnd, HWND(null_mut()), None, None).ok();
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

      let nested = FindWindowExW(current, HWND(null_mut()), None, None).ok();
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

      child = FindWindowExW(hwnd, current, None, None).ok();
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
        click_element(control.handle.clone()).await?;
        return Ok(());
      }
    }
  }

  Err(napi_error(format!(
    "No button with text '{button_text}' found in dialog"
  )))
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

  // Find the file name edit control (ComboBox32 or Edit sibling)
  for control in &controls {
    if control.control_type == "textbox"
      || control.control_type == "combobox"
      || control.control_type.eq_ignore_ascii_case("ComboBox32")
    {
      crate::interaction::type_text(control.handle.clone(), path.clone()).await?;
      // Also try sendKeys for UI that doesn't respond to WM_SETTEXT
      crate::interaction::send_keys(control.handle.clone(), path.clone()).await?;
      return Ok(());
    }
  }

  Err(napi_error(format!(
    "No text input control found in file dialog for window {window_handle}"
  )))
}
