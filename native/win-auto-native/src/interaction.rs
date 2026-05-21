use std::ptr::null_mut;
use napi::{Result};
use napi_derive::napi;
use windows::core::{BSTR, VARIANT};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Accessibility::{
  IUIAutomationInvokePattern, IUIAutomationSelectionItemPattern, IUIAutomationTogglePattern,
  IUIAutomationValuePattern, PropertyConditionFlags, PropertyConditionFlags_MatchSubstring,
  PropertyConditionFlags_IgnoreCase, TreeScope_Descendants, UIA_InvokePatternId,
  UIA_NamePropertyId, UIA_SelectionItemPatternId, UIA_TogglePatternId, UIA_ValuePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, MOUSEINPUT, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSE_EVENT_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, GetAncestor, GetParent, GetWindowRect, GetWindow, IsWindowVisible, MoveWindow, SendMessageW, SetForegroundWindow, SetCursorPos, ShowWindow, SwitchToThisWindow, GA_PARENT, GW_CHILD, GW_HWNDNEXT, SW_MAXIMIZE, SW_MINIMIZE, SW_NORMAL, SW_RESTORE, WM_HSCROLL, WM_SETTEXT, WM_VSCROLL};

use crate::config::get_config;
use crate::discovery::{create_uia, find_child_window_by_text, find_element_hwnd, find_element_uia};
use crate::error::napi_error;
use crate::utils::{get_window_title, hwnd_to_string, is_probable_notepad_window, parse_hwnd, to_wide_null_terminated};

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

#[napi(js_name = "sendKeys")]
pub async fn send_keys(element_handle: String, text: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = SetForegroundWindow(hwnd);
    std::thread::sleep(std::time::Duration::from_millis(10));
  }

  let mut inputs = Vec::with_capacity(text.encode_utf16().count() * 2);
  for code_point in text.encode_utf16() {
    let input_down = INPUT {
      r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
      Anonymous: INPUT_0 {
        ki: KEYBDINPUT {
          wVk: VIRTUAL_KEY(0),
          wScan: code_point,
          dwFlags: KEYEVENTF_UNICODE,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    let input_up = INPUT {
      r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
      Anonymous: INPUT_0 {
        ki: KEYBDINPUT {
          wVk: VIRTUAL_KEY(0),
          wScan: code_point,
          dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    inputs.push(input_down);
    inputs.push(input_up);
  }

  unsafe {
    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
  }

  Ok(())
}

#[napi(js_name = "pressKeyCodes")]
pub async fn press_key_codes(window_handle: String, key_codes: Vec<i32>) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, BOOL(1));
    let _ = SetForegroundWindow(hwnd);
    std::thread::sleep(std::time::Duration::from_millis(100));

    for &vk in &key_codes {
      let input_down = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
          ki: KEYBDINPUT {
            wVk: VIRTUAL_KEY(vk as u16),
            wScan: 0,
            dwFlags: KEYBD_EVENT_FLAGS(0),
            time: 0,
            dwExtraInfo: 0,
          },
        },
      };
      SendInput(&[input_down], std::mem::size_of::<INPUT>() as i32);
      std::thread::sleep(std::time::Duration::from_millis(10));
      let input_up = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
          ki: KEYBDINPUT {
            wVk: VIRTUAL_KEY(vk as u16),
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      };
      SendInput(&[input_up], std::mem::size_of::<INPUT>() as i32);
      std::thread::sleep(std::time::Duration::from_millis(10));
    }
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

    let element = root.FindFirst(TreeScope_Descendants, &condition)
      .map_err(|err| napi_error(format!("Failed to find UIA element by name: {err}")))?;

    if let Ok(current_name) = element.CurrentName() {
      let current_name = current_name.to_string();
      if !current_name.is_empty() && current_name.to_ascii_lowercase().contains(&query_lower) {
        return Ok(Some(current_name));
      }
    }

    // Fallback: search all descendants by name substring if the direct property condition didn't match.
    let true_condition = automation.CreateTrueCondition().map_err(|err| napi_error(format!("Failed to create UIA true condition: {err}")))?;
    let all = root
      .FindAll(TreeScope_Descendants, &true_condition)
      .map_err(|err| napi_error(format!("Failed to search UIA descendants: {err}")))?;
    let length = all.Length().map_err(|err| napi_error(format!("Failed to get UIA collection length: {err}")))?;

    for i in 0..length {
      let element = all.GetElement(i).map_err(|err| napi_error(format!("Failed to read UIA element from collection: {err}")))?;
      let current_name = element.CurrentName().ok().map(|name| name.to_string()).unwrap_or_default();
      if current_name.is_empty() {
        continue;
      }
      if current_name.to_ascii_lowercase().contains(&query_lower) {
        return Ok(Some(current_name));
      }
    }

    Ok(None)
  }
}

fn invoke_uia_element(element: &windows::Win32::UI::Accessibility::IUIAutomationElement) -> Result<()> {
  unsafe {
    let pattern: IUIAutomationInvokePattern = element
      .GetCurrentPatternAs(UIA_InvokePatternId)
      .map_err(|err| napi_error(format!("Invoke pattern not available on element: {err}")))?;
    pattern
      .Invoke()
      .map_err(|err| napi_error(format!("Invoke failed: {err}")))?;
  }
  Ok(())
}

#[napi(js_name = "clickElement")]
pub async fn click_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA element from handle: {err}")))?;
    invoke_uia_element(&element)
  }
}

fn find_and_invoke_by_name(
  automation: &windows::Win32::UI::Accessibility::IUIAutomation,
  root: &windows::Win32::UI::Accessibility::IUIAutomationElement,
  query_lower: &str,
) -> Result<bool> {
  unsafe {
    // Fast path: try FindFirst with an exact-match property condition.
    let exact_value: VARIANT = BSTR::from(query_lower).into();
    if let Ok(condition) = automation.CreatePropertyConditionEx(
      UIA_NamePropertyId,
      &exact_value,
      PropertyConditionFlags(PropertyConditionFlags_IgnoreCase.0),
    ) {
      if let Ok(element) = root.FindFirst(TreeScope_Descendants, &condition) {
        if let Ok(current_name) = element.CurrentName() {
          let current_name = current_name.to_string();
          if !current_name.is_empty()
            && current_name.to_ascii_lowercase() == query_lower
          {
            invoke_uia_element(&element)?;
            return Ok(true);
          }
        }
      }
    }

    // Fast path #2: try FindFirst with substring match.
    let substring_value: VARIANT = BSTR::from(query_lower).into();
    let substring_flags = PropertyConditionFlags(
      PropertyConditionFlags_MatchSubstring.0 | PropertyConditionFlags_IgnoreCase.0,
    );
    if let Ok(condition) = automation.CreatePropertyConditionEx(
      UIA_NamePropertyId,
      &substring_value,
      substring_flags,
    ) {
      if let Ok(element) = root.FindFirst(TreeScope_Descendants, &condition) {
        if let Ok(current_name) = element.CurrentName() {
          let current_name = current_name.to_string();
          if !current_name.is_empty()
            && current_name.to_ascii_lowercase().contains(query_lower)
          {
            invoke_uia_element(&element)?;
            return Ok(true);
          }
        }
      }
    }

    // Slow path: enumerate all descendants and search manually.
    if let Ok(true_condition) = automation.CreateTrueCondition() {
      if let Ok(all) = root.FindAll(TreeScope_Descendants, &true_condition) {
        if let Ok(length) = all.Length() {
          for i in 0..length {
            if let Ok(element) = all.GetElement(i) {
              let current_name = element
                .CurrentName()
                .ok()
                .map(|n| n.to_string())
                .unwrap_or_default();
              if !current_name.is_empty()
                && current_name.to_ascii_lowercase().contains(query_lower)
              {
                invoke_uia_element(&element)?;
                return Ok(true);
              }
            }
          }
        }
      }
    }

    Ok(false)
  }
}

#[napi(js_name = "clickElementByName")]
pub async fn click_element_by_name(window_handle: String, name: String) -> Result<()> {
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;

    let hwnd = parse_hwnd(&window_handle)?;
    let root = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA root from handle: {err}")))?;

    let query_lower = name.to_ascii_lowercase();
    if find_and_invoke_by_name(&automation, &root, &query_lower)? {
      return Ok(());
    }
    Err(napi_error(format!("No UIA element found with name containing '{name}'")))
  }
}

/// Clicks a sequence of elements by name in a single UIA tree traversal.
/// This is much faster than calling clickElementByName N times because
/// it only enumerates the UIA tree once instead of N times.
#[napi(js_name = "clickSequence")]
pub async fn click_sequence(window_handle: String, names: Vec<String>) -> Result<()> {
  if names.is_empty() {
    return Ok(());
  }

  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;

    let hwnd = parse_hwnd(&window_handle)?;
    let root = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA root from handle: {err}")))?;

    let lower_names: Vec<String> = names.iter().map(|n| n.to_ascii_lowercase()).collect();
    let mut remaining: Vec<bool> = vec![true; names.len()];
    let total = names.len();

    // Single FindAll, then search for each name independently.
    // Iterating name-by-name avoids mismatches from one element matching
    // multiple name substrings (e.g. non-button elements whose names
    // happen to contain "plus" or "equals").
    if let Ok(true_condition) = automation.CreateTrueCondition() {
      if let Ok(all) = root.FindAll(TreeScope_Descendants, &true_condition) {
        if let Ok(length) = all.Length() {
          for j in 0..total {
            if !remaining[j] { continue; }
            for i in 0..length {
              if let Ok(element) = all.GetElement(i) {
                let current_name = element
                  .CurrentName()
                  .ok()
                  .map(|n| n.to_string())
                  .unwrap_or_default();
                if current_name.is_empty() { continue; }
                let lower = current_name.to_ascii_lowercase();
                if lower.contains(&lower_names[j]) {
                  if let Err(err) = invoke_uia_element(&element) {
                    return Err(napi_error(format!(
                      "Failed to invoke '{}': {}", names[j], err
                    )));
                  }
                  remaining[j] = false;
                  break;
                }
              }
            }
            if remaining[j] {
              return Err(napi_error(format!(
                "No UIA element found with name containing '{}'", names[j]
              )));
            }
          }
        }
      }
    }

    // Check for any remaining unfound names.
    for j in 0..total {
      if remaining[j] {
        return Err(napi_error(format!(
          "No UIA element found with name containing '{}'", names[j]
        )));
      }
    }

    Ok(())
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

#[napi(js_name = "getValue")]
pub async fn get_value(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA element: {err}")))?;
    let pattern: IUIAutomationValuePattern = element
      .GetCurrentPatternAs(UIA_ValuePatternId)
      .map_err(|err| napi_error(format!("Value pattern not available on element: {err}")))?;
    let value = pattern.CurrentValue().map_err(|err| napi_error(format!("Failed to get value: {err}")))?;
    Ok(value.to_string())
  }
}

#[napi(js_name = "setValue")]
pub async fn set_value(element_handle: String, value: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA element: {err}")))?;
    let pattern: IUIAutomationValuePattern = element
      .GetCurrentPatternAs(UIA_ValuePatternId)
      .map_err(|err| napi_error(format!("Value pattern not available on element: {err}")))?;
    let bstr: BSTR = value.into();
    pattern.SetValue(&bstr).map_err(|err| napi_error(format!("Failed to set value: {err}")))?;
  }
  Ok(())
}

#[napi(js_name = "selectElement")]
pub async fn select_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA element: {err}")))?;
    let pattern: IUIAutomationSelectionItemPattern = element
      .GetCurrentPatternAs(UIA_SelectionItemPatternId)
      .map_err(|err| napi_error(format!("SelectionItem pattern not available on element: {err}")))?;
    pattern.Select().map_err(|err| napi_error(format!("Failed to select element: {err}")))?;
  }
  Ok(())
}

#[napi(js_name = "toggleElement")]
pub async fn toggle_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA element: {err}")))?;
    let pattern: IUIAutomationTogglePattern = element
      .GetCurrentPatternAs(UIA_TogglePatternId)
      .map_err(|err| napi_error(format!("Toggle pattern not available on element: {err}")))?;
    pattern.Toggle().map_err(|err| napi_error(format!("Failed to toggle element: {err}")))?;
  }
  Ok(())
}

#[napi(js_name = "getToggleState")]
pub async fn get_toggle_state(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let automation = create_uia().map_err(|err| napi_error(format!("Failed to initialize UIAutomation: {err}")))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|err| napi_error(format!("Failed to get UIA element: {err}")))?;
    let pattern: IUIAutomationTogglePattern = element
      .GetCurrentPatternAs(UIA_TogglePatternId)
      .map_err(|err| napi_error(format!("Toggle pattern not available on element: {err}")))?;
    let state = pattern.CurrentToggleState().map_err(|err| napi_error(format!("Failed to get toggle state: {err}")))?;
    let label = match state.0 {
      0 => "Off",
      1 => "On",
      _ => "Indeterminate",
    };
    Ok(label.to_string())
  }
}

#[napi(js_name = "findAll")]
pub async fn find_all(
  window_handle: String,
  class_names: Option<Vec<String>>,
  _automation_id: Option<String>,
  name: Option<String>,
  _role: Option<String>,
) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&window_handle)?;
  let mut results: Vec<HWND> = Vec::new();

  if let Some(classes) = class_names {
    fn collect_by_class(parent: HWND, classes: &[String], out: &mut Vec<HWND>) {
      unsafe {
        let mut child = FindWindowExW(parent, HWND(null_mut()), None, None).ok();
        while let Some(current) = child {
          if current.is_invalid() { break; }
          let class_name = crate::utils::get_class_name(current);
          if classes.iter().any(|c| class_name.eq_ignore_ascii_case(c)) {
            if !out.iter().any(|h| h.0 == current.0) {
              out.push(current);
            }
          }
          collect_by_class(current, classes, out);
          child = FindWindowExW(parent, current, None, None).ok();
        }
      }
    }
    collect_by_class(hwnd, &classes, &mut results);
  }

  if let Some(ref query_name) = name {
    unsafe {
      let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
      if let Ok(automation) = create_uia() {
        if let Ok(root) = automation.ElementFromHandle(hwnd) {
          if let Ok(true_condition) = automation.CreateTrueCondition() {
            if let Ok(all) = root.FindAll(TreeScope_Descendants, &true_condition) {
              if let Ok(length) = all.Length() {
                let query_lower = query_name.to_ascii_lowercase();
                for i in 0..length {
                  if let Ok(element) = all.GetElement(i) {
                    if let Ok(current_name) = element.CurrentName() {
                      let current_name = current_name.to_string();
                      if !current_name.is_empty()
                        && current_name.to_ascii_lowercase().contains(&query_lower)
                      {
                        if let Ok(hwnd_raw) = element.CurrentNativeWindowHandle() {
                          if !hwnd_raw.is_invalid() {
                            if !results.iter().any(|h| h.0 == hwnd_raw.0) {
                              results.push(hwnd_raw);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  Ok(results.into_iter().map(|h| hwnd_to_string(h)).collect())
}

#[napi(js_name = "getParent")]
pub async fn get_parent_element(element_handle: String) -> Result<Option<String>> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let parent = GetAncestor(hwnd, GA_PARENT);
    if !parent.is_invalid() && parent.0 != hwnd.0 {
      Ok(Some(hwnd_to_string(parent)))
    } else {
      Ok(None)
    }
  }
}

#[napi(js_name = "getChildren")]
pub async fn get_child_elements(element_handle: String) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&element_handle)?;
  let mut children = Vec::new();
  unsafe {
    let first = GetWindow(hwnd, GW_CHILD);
    if let Ok(mut current) = first {
      if !current.is_invalid() {
        children.push(hwnd_to_string(current));
        loop {
          let next = GetWindow(current, GW_HWNDNEXT);
          match next {
            Ok(next_hwnd) => {
              if next_hwnd.is_invalid() { break; }
              current = next_hwnd;
              children.push(hwnd_to_string(current));
            }
            Err(_) => break,
          }
        }
      }
    }
  }
  Ok(children)
}

#[napi(js_name = "getSiblings")]
pub async fn get_sibling_elements(element_handle: String) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&element_handle)?;
  let mut siblings = Vec::new();
  unsafe {
    if let Ok(parent) = GetParent(hwnd) {
      if !parent.is_invalid() {
        let first = GetWindow(parent, GW_CHILD);
        if let Ok(mut current) = first {
          if !current.is_invalid() && current.0 != hwnd.0 {
            siblings.push(hwnd_to_string(current));
          }
          loop {
            let next = GetWindow(current, GW_HWNDNEXT);
            match next {
              Ok(next_hwnd) => {
                if next_hwnd.is_invalid() { break; }
                current = next_hwnd;
                if current.0 != hwnd.0 {
                  siblings.push(hwnd_to_string(current));
                }
              }
              Err(_) => break,
            }
          }
        }
      }
    }
  }
  Ok(siblings)
}

#[napi(js_name = "isVisible")]
pub async fn is_element_visible(element_handle: String) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        let offscreen = element.CurrentIsOffscreen().map_err(|err| napi_error(format!("Failed to get offscreen state: {err}")))?;
        return Ok(!offscreen.as_bool());
      }
    }
    // Fallback to Win32
    Ok(IsWindowVisible(hwnd).as_bool())
  }
}

#[napi(js_name = "isEnabled")]
pub async fn is_element_enabled(element_handle: String) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        let enabled = element.CurrentIsEnabled().map_err(|err| napi_error(format!("Failed to get enabled state: {err}")))?;
        return Ok(enabled.as_bool());
      }
    }
    Ok(true)
  }
}

#[napi(js_name = "isFocused")]
pub async fn is_element_focused(element_handle: String) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        let focused = element.CurrentHasKeyboardFocus().map_err(|err| napi_error(format!("Failed to get focus state: {err}")))?;
        return Ok(focused.as_bool());
      }
    }
    Ok(false)
  }
}

#[napi(object)]
pub struct WindowBounds {
  pub left: i32,
  pub top: i32,
  pub width: i32,
  pub height: i32,
}

#[napi(js_name = "getWindowBounds")]
pub async fn get_window_bounds(window_handle: String) -> Result<WindowBounds> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(napi_error("Failed to get window rectangle"));
    }
    Ok(WindowBounds {
      left: rect.left,
      top: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    })
  }
}

#[napi(js_name = "setWindowBounds")]
pub async fn set_window_bounds(
  window_handle: String,
  left: i32,
  top: i32,
  width: i32,
  height: i32,
) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    MoveWindow(hwnd, left, top, width, height, BOOL(1))
      .map_err(|err| napi_error(format!("Failed to set window bounds: {err}")))?;
  }
  Ok(())
}

#[napi(js_name = "maximizeWindow")]
pub async fn maximize_window(window_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_MAXIMIZE);
  }
  Ok(())
}

#[napi(js_name = "minimizeWindow")]
pub async fn minimize_window(window_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_MINIMIZE);
  }
  Ok(())
}

#[napi(js_name = "restoreWindow")]
pub async fn restore_window(window_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_RESTORE);
  }
  Ok(())
}

fn vk_from_name(name: &str) -> Option<u16> {
  Some(match name.to_ascii_lowercase().as_str() {
    "cancel" => 0x03,
    "backspace" | "back" => 0x08,
    "tab" => 0x09,
    "clear" => 0x0C,
    "enter" | "return" => 0x0D,
    "shift" => 0x10,
    "ctrl" | "control" => 0x11,
    "alt" | "menu" => 0x12,
    "pause" => 0x13,
    "capslock" | "caps" => 0x14,
    "escape" | "esc" => 0x1B,
    "space" | "spacebar" => 0x20,
    "pageup" | "prior" => 0x21,
    "pagedown" | "next" => 0x22,
    "end" => 0x23,
    "home" => 0x24,
    "left" => 0x25,
    "up" => 0x26,
    "right" => 0x27,
    "down" => 0x28,
    "select" => 0x29,
    "print" | "printscreen" | "prtsc" => 0x2C,
    "insert" | "ins" => 0x2D,
    "delete" | "del" => 0x2E,
    "help" => 0x2F,
    "0" => 0x30, "1" => 0x31, "2" => 0x32, "3" => 0x33, "4" => 0x34,
    "5" => 0x35, "6" => 0x36, "7" => 0x37, "8" => 0x38, "9" => 0x39,
    "a" => 0x41, "b" => 0x42, "c" => 0x43, "d" => 0x44, "e" => 0x45,
    "f" => 0x46, "g" => 0x47, "h" => 0x48, "i" => 0x49, "j" => 0x4A,
    "k" => 0x4B, "l" => 0x4C, "m" => 0x4D, "n" => 0x4E, "o" => 0x4F,
    "p" => 0x50, "q" => 0x51, "r" => 0x52, "s" => 0x53, "t" => 0x54,
    "u" => 0x55, "v" => 0x56, "w" => 0x57, "x" => 0x58, "y" => 0x59,
    "z" => 0x5A,
    "lwin" | "lcmd" | "lmeta" => 0x5B,
    "rwin" | "rcmd" | "rmeta" => 0x5C,
    "apps" => 0x5D,
    "sleep" => 0x5F,
    "numpad0" => 0x60, "numpad1" => 0x61, "numpad2" => 0x62, "numpad3" => 0x63,
    "numpad4" => 0x64, "numpad5" => 0x65, "numpad6" => 0x66, "numpad7" => 0x67,
    "numpad8" => 0x68, "numpad9" => 0x69,
    "multiply" | "*" => 0x6A,
    "add" | "+" => 0x6B,
    "separator" => 0x6C,
    "subtract" | "-" => 0x6D,
    "decimal" => 0x6E,
    "divide" => 0x6F,
    "f1" => 0x70, "f2" => 0x71, "f3" => 0x72, "f4" => 0x73,
    "f5" => 0x74, "f6" => 0x75, "f7" => 0x76, "f8" => 0x77,
    "f9" => 0x78, "f10" => 0x79, "f11" => 0x7A, "f12" => 0x7B,
    "f13" => 0x7C, "f14" => 0x7D, "f15" => 0x7E, "f16" => 0x7F,
    "f17" => 0x80, "f18" => 0x81, "f19" => 0x82, "f20" => 0x83,
    "f21" => 0x84, "f22" => 0x85, "f23" => 0x86, "f24" => 0x87,
    "numlock" => 0x90,
    "scrolllock" | "scroll" => 0x91,
    "lshift" => 0xA0,
    "rshift" => 0xA1,
    "lctrl" | "lcontrol" => 0xA2,
    "rctrl" | "rcontrol" => 0xA3,
    "lalt" | "lmenu" => 0xA4,
    "ralt" | "rmenu" => 0xA5,
    "semicolon" | ";" => 0xBA,
    "plus" | "=" => 0xBB,
    "comma" | "," => 0xBC,
    "minus" | "_" => 0xBD,
    "period" | "." => 0xBE,
    "slash" | "/" | "?" => 0xBF,
    "tilde" | "`" | "~" => 0xC0,
    "lbracket" | "[" | "{" => 0xDB,
    "backslash" | "\\" | "|" => 0xDC,
    "rbracket" | "]" | "}" => 0xDD,
    "quote" | "'" | "\"" => 0xDE,
    _ => return None,
  })
}

fn send_key_code(vk: u16, flags: KEYBD_EVENT_FLAGS) {
  unsafe {
    let input = INPUT {
      r#type: INPUT_KEYBOARD,
      Anonymous: INPUT_0 {
        ki: KEYBDINPUT {
          wVk: VIRTUAL_KEY(vk),
          wScan: 0,
          dwFlags: flags,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
  }
}

fn send_key_down(vk: u16) {
  send_key_code(vk, KEYBD_EVENT_FLAGS(0));
}

fn send_key_up(vk: u16) {
  send_key_code(vk, KEYEVENTF_KEYUP);
}

fn send_char_key(vk: u16) {
  send_key_down(vk);
  std::thread::sleep(std::time::Duration::from_millis(5));
  send_key_up(vk);
}

#[napi(js_name = "pressKey")]
pub async fn press_key(window_handle: String, key_combination: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, BOOL(1));
    let _ = SetForegroundWindow(hwnd);
    std::thread::sleep(std::time::Duration::from_millis(50));
  }

  let parts: Vec<&str> = key_combination.split('+').map(|s| s.trim()).collect();
  if parts.is_empty() {
    return Err(napi_error("Empty key combination"));
  }

  let main_key = parts.last().ok_or_else(|| napi_error("No main key in combination"))?;
  let main_vk = vk_from_name(main_key)
    .ok_or_else(|| napi_error(format!("Unknown key: {main_key}")))?;

  let mut modifier_keys = Vec::new();
  for i in 0..parts.len().saturating_sub(1) {
    let mod_name = parts[i];
    let mod_vk = vk_from_name(mod_name)
      .ok_or_else(|| napi_error(format!("Unknown modifier: {mod_name}")))?;
    modifier_keys.push(mod_vk);
  }

  for &vk in &modifier_keys {
    send_key_down(vk);
  }
  std::thread::sleep(std::time::Duration::from_millis(10));
  send_char_key(main_vk);
  std::thread::sleep(std::time::Duration::from_millis(10));
  for &vk in modifier_keys.iter().rev() {
    send_key_up(vk);
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
