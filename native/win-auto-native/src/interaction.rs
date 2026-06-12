use napi::{Error, Result};
use napi_derive::napi;
use tracing::{info, debug};
use windows::core::BSTR;
use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows::Win32::System::Variant::VARIANT;

use windows::Win32::UI::Accessibility::{
  IUIAutomation, IUIAutomationCondition, IUIAutomationElement, IUIAutomationInvokePattern,
  IUIAutomationLegacyIAccessiblePattern, IUIAutomationSelectionItemPattern,
  IUIAutomationTogglePattern, IUIAutomationTextPattern, IUIAutomationValuePattern,
  PropertyConditionFlags, PropertyConditionFlags_MatchSubstring, PropertyConditionFlags_IgnoreCase,
  UIA_PROPERTY_ID,
  TreeScope_Children, TreeScope_Descendants,
  UIA_AutomationIdPropertyId, UIA_AriaRolePropertyId,
  UIA_InvokePatternId, UIA_LegacyIAccessiblePatternId, UIA_NamePropertyId, UIA_SelectionItemPatternId,
  UIA_TextPatternId, UIA_TogglePatternId, UIA_ValuePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, MOUSEINPUT, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSE_EVENT_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, GetAncestor, GetParent, GetWindowRect, GetWindow, IsWindowVisible, MoveWindow, SendMessageW, SetForegroundWindow, SetCursorPos, ShowWindow, SwitchToThisWindow, GA_PARENT, GW_CHILD, GW_HWNDNEXT, SW_MAXIMIZE, SW_MINIMIZE, SW_NORMAL, SW_RESTORE, SW_SHOW, WM_GETTEXT, WM_HSCROLL, WM_SETTEXT, WM_VSCROLL};

use crate::discovery::{create_uia, find_child_window_by_text, find_element_hwnd, find_element_uia};
use crate::error::AutomationError;

use crate::utils::{hwnd_to_string, logical_to_physical, parse_hwnd, physical_to_logical, to_wide_null_terminated};

fn match_mode_matches(actual: &str, query: &str, mode: &str) -> bool {
  match mode {
    "exact" => actual.eq_ignore_ascii_case(query),
    "regex" => {
      if let Ok(re) = regex::Regex::new(&format!("(?i){}", query)) {
        re.is_match(actual)
      } else {
        false
      }
    }
    _ => actual.to_ascii_lowercase().contains(&query.to_ascii_lowercase()),
  }
}

unsafe fn try_build_uia_condition(
  automation: &IUIAutomation,
  property_id: UIA_PROPERTY_ID,
  value: &str,
  match_mode: &str,
) -> Option<IUIAutomationCondition> {
  let variant: VARIANT = BSTR::from(value).into();
  match match_mode {
    "exact" => automation
      .CreatePropertyConditionEx(
        property_id,
        &variant,
        PropertyConditionFlags(PropertyConditionFlags_IgnoreCase.0),
      )
      .ok(),
    "substring" => automation
      .CreatePropertyConditionEx(
        property_id,
        &variant,
        PropertyConditionFlags(
          PropertyConditionFlags_MatchSubstring.0 | PropertyConditionFlags_IgnoreCase.0,
        ),
      )
      .ok(),
    _ => None,
  }
}

unsafe fn combine_and_conditions(
  automation: &IUIAutomation,
  mut conditions: Vec<IUIAutomationCondition>,
) -> Option<IUIAutomationCondition> {
  if conditions.is_empty() {
    return None;
  }
  let mut combined = conditions.remove(0);
  for cond in conditions {
    if let Ok(and_cond) = automation.CreateAndCondition(&combined, &cond) {
      combined = and_cond;
    }
  }
  Some(combined)
}

fn find_element_uia_by_conditions(
  hwnd: HWND,
  automation_id: Option<&str>,
  name: Option<&str>,
  role: Option<&str>,
  match_mode: Option<&str>,
) -> Option<HWND> {
  unsafe {
    // SAFETY: COM initialized via ComScope; hwnd is a valid window handle from the caller.
    // UIA COM calls follow the COM ABI and operate on the initialized automation object.
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().ok()?;
    let root = automation.ElementFromHandle(hwnd).ok()?;
    let mm = match_mode.unwrap_or("substring");

    // Fast path: use native UIA PropertyCondition + FindFirst (O(log n))
    // Only for non-regex modes where UIA can filter natively.
    if mm != "regex" {
      let conditions: Vec<IUIAutomationCondition> = [
        name.map(|v| (UIA_NamePropertyId, v)),
        role.map(|v| (UIA_AriaRolePropertyId, v)),
        automation_id.map(|v| (UIA_AutomationIdPropertyId, v)),
      ]
      .into_iter()
      .flatten()
      .filter_map(|(pid, val)| try_build_uia_condition(&automation, pid, val, mm))
      .collect();

      if !conditions.is_empty() {
        let composite = combine_and_conditions(&automation, conditions);
        if let Some(ref condition) = composite {
          if let Ok(element) = root.FindFirst(TreeScope_Descendants, condition) {
            if let Ok(hwnd_raw) = element.CurrentNativeWindowHandle() {
              if !hwnd_raw.is_invalid() {
                // Verify the match (UIA substring conditions can return near-matches).
                let current_name = element.CurrentName().ok()
                  .and_then(|n| { let s = n.to_string(); if s.is_empty() { None } else { Some(s) } })
                  .or_else(|| get_legacy_accessible_name(&element));
                if let Some(ref cn) = current_name {
                  if name.map_or(true, |q| match_mode_matches(cn, q, mm)) {
                    return Some(hwnd_raw);
                  }
                } else if name.is_none() {
                  return Some(hwnd_raw);
                }
              }
            }
          }
        }
      }
    }

    // Slow path: full enumeration for regex or if FindFirst missed.
    let true_condition = automation.CreateTrueCondition().ok()?;
    let all = root.FindAll(TreeScope_Descendants, &true_condition).ok()?;
    let length = all.Length().ok()?;

    for i in 0..length {
      let element = all.GetElement(i).ok()?;

      if let Some(query_name) = name {
        let current_name = element.CurrentName().ok()
          .and_then(|n| { let s = n.to_string(); if s.is_empty() { None } else { Some(s) } })
          .or_else(|| get_legacy_accessible_name(&element))
          .unwrap_or_default();
        if !match_mode_matches(&current_name, query_name, mm) {
          continue;
        }
      }

      if let Some(query_role) = role {
        if let Ok(current_role) = element.CurrentAriaRole() {
          let current_role = current_role.to_string();
          if !match_mode_matches(&current_role, query_role, mm) {
            continue;
          }
        } else {
          continue;
        }
      }

      if let Some(query_auto_id) = automation_id {
        if let Ok(current_auto_id) = element.CurrentAutomationId() {
          let current_auto_id = current_auto_id.to_string();
          if !match_mode_matches(&current_auto_id, query_auto_id, mm) {
            continue;
          }
        } else {
          continue;
        }
      }

      if let Ok(hwnd_raw) = element.CurrentNativeWindowHandle() {
        if !hwnd_raw.is_invalid() {
          return Some(hwnd_raw);
        }
      }
    }
    None
  }
}

#[napi(js_name = "findElement")]
pub async fn find_element(
  window_handle: String,
  class_names: Option<Vec<String>>,
  automation_id: Option<String>,
  name: Option<String>,
  role: Option<String>,
  class_name: Option<String>,
  text: Option<String>,
  match_mode: Option<String>,
) -> Result<Option<String>> {
  debug!("findElement hwnd={window_handle} automation_id={automation_id:?} name={name:?} role={role:?} class_name={class_name:?} text={text:?} match_mode={match_mode:?}");
  let mut classes = class_names.unwrap_or_default();

  // If className is provided directly, append it to the class names list
  if let Some(ref cn) = class_name {
    if !classes.iter().any(|c| c.eq_ignore_ascii_case(cn)) {
      classes.push(cn.clone());
    }
  }

  let hwnd = parse_hwnd(&window_handle)?;
  let mm = match_mode.as_deref().unwrap_or("substring");

  // Determine search strategy based on available selectors
  let has_uia_selector = automation_id.is_some() || role.is_some()
    || (name.is_some() && classes.is_empty())
    || text.is_some();

  // If we have className but no UIA-specific selectors, try HWND class-based search first
  if class_name.is_some() && !has_uia_selector {
    if !classes.is_empty() {
      if let Some(element_hwnd) = find_element_hwnd(hwnd, &classes) {
        return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
      }
    }
    // Also try text-based search on class-matched elements
    if let Some(ref query_text) = text {
      if let Some(element_hwnd) = find_child_window_by_text(hwnd, query_text) {
        return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
      }
    }
    return Ok(None);
  }

  // UIA search path (for automationId, role, or name-based with no class names)
  if has_uia_selector {
    if let Some(element_hwnd) = find_element_uia_by_conditions(
      hwnd,
      automation_id.as_deref(),
      name.as_deref(),
      role.as_deref(),
      Some(mm),
    ) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
  }

  // Fallback: HWND class-based search
  if !classes.is_empty() {
    if let Some(element_hwnd) = find_element_hwnd(hwnd, &classes) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
  }

  // Fallback: name-based search (with match mode)
  if let Some(ref query_name) = name {
    // HWND text search
    if let Some(element_hwnd) = find_child_window_by_text(hwnd, query_name) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
    // UIA name search
    if let Some(element_hwnd) = find_element_uia(hwnd, query_name) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
  }

  // Fallback: text-based search
  if let Some(ref query_text) = text {
    if let Some(element_hwnd) = find_child_window_by_text(hwnd, query_text) {
      return Ok(Some(crate::utils::hwnd_to_string(element_hwnd)));
    }
  }

  Ok(None)
}

#[napi(js_name = "typeText")]
pub async fn type_text(
  element_handle: String,
  text: String,
  input_mode: Option<crate::patterns::InputMode>,
) -> Result<()> {
  let mode = input_mode.unwrap_or(crate::patterns::InputMode::Auto);
  type_text_with_mode(element_handle, text, mode).await
}

/// Type text with explicit input mode.
pub(super) async fn type_text_with_mode(
  element_handle: String,
  text: String,
  mode: crate::patterns::InputMode,
) -> Result<()> {
  debug!("typeText hwnd={element_handle} text_len={} mode={mode:?}", text.len());
  let hwnd = parse_hwnd(&element_handle)?;

  match mode {
    crate::patterns::InputMode::Pattern => {
      // UIA ValuePattern only
      unsafe {
        let _com_init = crate::utils::ComScope::init();
        if let Ok(automation) = create_uia() {
          if let Ok(element) = automation.ElementFromHandle(hwnd) {
            if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
              let bstr: BSTR = text.into();
              pattern.SetValue(&bstr).map_err(|err| {
                Error::from(AutomationError::Generic {
                  message: format!("ValuePattern.SetValue failed: {err}"),
                })
              })?;
              return Ok(());
            }
          }
        }
      }
      Err(Error::from(AutomationError::Generic {
        message: "UIA ValuePattern not available for this element in pattern mode".into(),
      }))
    }

    crate::patterns::InputMode::Hardware => {
      // Hardware-only: use enigo or SendInput
      #[cfg(feature = "input-hardware")]
      {
        return crate::hardware_input::hardware_type_text(element_handle, text);
      }
      #[cfg(not(feature = "input-hardware"))]
      {
        hardware_type_sendinput(element_handle, text).await
      }
    }

    crate::patterns::InputMode::Auto => {
      // Auto: try UIA first
      unsafe {
        let _com_init = crate::utils::ComScope::init();
        if let Ok(automation) = create_uia() {
          if let Ok(element) = automation.ElementFromHandle(hwnd) {
            if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
              let bstr: BSTR = text.clone().into();
              let _ = pattern.SetValue(&bstr);
              return Ok(());
            }
          }
        }
      }
      // Fallback: Win32 WM_SETTEXT
      tracing::warn!("UIA ValuePattern failed for hwnd={element_handle}, falling back to WM_SETTEXT");
      let wide = to_wide_null_terminated(&text);
      unsafe {
        SendMessageW(hwnd, WM_SETTEXT, Some(WPARAM(0)), Some(LPARAM(wide.as_ptr() as isize)));
      }
      Ok(())
    }
  }
}

/// Hardware-only type via SendInput Unicode keystrokes.
async fn hardware_type_sendinput(element_handle: String, text: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(10)).await;

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

#[napi(js_name = "sendKeys")]
pub async fn send_keys(
  element_handle: String,
  text: String,
  input_mode: Option<crate::patterns::InputMode>,
) -> Result<()> {
  let mode = input_mode.unwrap_or(crate::patterns::InputMode::Auto);
  match mode {
    crate::patterns::InputMode::Pattern => {
      // Pattern-only: try UIA ValuePattern
      let hwnd = parse_hwnd(&element_handle)?;
      unsafe {
        let _com_init = crate::utils::ComScope::init();
        if let Ok(automation) = create_uia() {
          if let Ok(element) = automation.ElementFromHandle(hwnd) {
            if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
              let bstr: BSTR = text.into();
              pattern.SetValue(&bstr).map_err(|err| {
                Error::from(AutomationError::Generic {
                  message: format!("ValuePattern.SetValue failed: {err}"),
                })
              })?;
              return Ok(());
            }
          }
        }
      }
      Err(Error::from(AutomationError::Generic {
        message: "UIA ValuePattern not available in pattern mode".into(),
      }))
    }
    _ => {
      // Hardware or Auto: use SendInput keystrokes
      let hwnd = parse_hwnd(&element_handle)?;
      unsafe {
        let _ = SetForegroundWindow(hwnd);
      }
      tokio::time::sleep(std::time::Duration::from_millis(10)).await;

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
  }
}

#[napi(js_name = "pressKeyCodes")]
pub async fn press_key_codes(window_handle: String, key_codes: Vec<i32>) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(100)).await;

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
    unsafe {
      SendInput(&[input_down], std::mem::size_of::<INPUT>() as i32);
    }
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
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
    unsafe {
      SendInput(&[input_up], std::mem::size_of::<INPUT>() as i32);
    }
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
  }
  Ok(())
}

#[napi(js_name = "getText")]
pub async fn get_text(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;

  // Try UIA ValuePattern first (works for richer controls)
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
          if let Ok(value) = pattern.CurrentValue() {
            let text = value.to_string();
            if !text.is_empty() {
              return Ok(text);
            }
          }
        }
      }
    }
  }

  // Fallback: WM_GETTEXT for standard Windows controls
  tracing::warn!("UIA ValuePattern.CurrentValue failed for hwnd={element_handle}, falling back to WM_GETTEXT");
  unsafe {
    let len = SendMessageW(hwnd, WM_GETTEXT, Some(WPARAM(0)), Some(LPARAM(0))).0;
    if len > 0 {
      let mut buffer = vec![0u16; (len + 1) as usize];
      let copied = SendMessageW(
        hwnd,
        WM_GETTEXT,
        Some(WPARAM(buffer.len() as _)),
        Some(LPARAM(buffer.as_mut_ptr() as isize)),
      );
      if copied.0 > 0 {
        return Ok(String::from_utf16_lossy(&buffer[..copied.0 as usize]));
      }
    }
  }

  Ok(String::new())
}

#[napi(js_name = "findElementName")]
pub async fn find_element_name(window_handle: String, name: String) -> Result<Option<String>> {
  let hwnd = parse_hwnd(&window_handle)?;
  // SAFETY: COM is initialized via ComScope; create_uia returns a cached or new IUIAutomation.
  // UIA property conditions and FindAll/FindFirst calls follow the UIA COM ABI.
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let root = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: "".into() }))?;
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
      .map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    let element = root.FindFirst(TreeScope_Descendants, &condition)
      .map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    if let Ok(current_name) = element.CurrentName() {
      let current_name = current_name.to_string();
      if !current_name.is_empty() && current_name.to_ascii_lowercase().contains(&query_lower) {
        return Ok(Some(current_name));
      }
    }

    // Fallback: search all descendants by name substring if the direct property condition didn't match.
    let true_condition = automation.CreateTrueCondition().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let all = root
      .FindAll(TreeScope_Descendants, &true_condition)
      .map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let length = all.Length().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    for i in 0..length {
      let element = all.GetElement(i).map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
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
      .map_err(|_err| Error::from(AutomationError::PatternNotSupported { handle: "".into(), pattern: "InvokePattern" }))?;
    pattern
      .Invoke()
      .map_err(|err| Error::from(AutomationError::Generic { message: format!("Invoke failed: {err}") }))?;
  }
  Ok(())
}

#[napi(js_name = "clickElement")]
pub async fn click_element(
  element_handle: String,
  input_mode: Option<crate::patterns::InputMode>,
) -> Result<()> {
  let mode = input_mode.unwrap_or(crate::patterns::InputMode::Auto);
  click_element_with_mode(element_handle, mode).await
}

/// Internal click with explicit input mode.
pub(super) async fn click_element_with_mode(
  element_handle: String,
  mode: crate::patterns::InputMode,
) -> Result<()> {
  info!("clickElement hwnd={element_handle} mode={mode:?}");
  let hwnd = parse_hwnd(&element_handle)?;

  match mode {
    crate::patterns::InputMode::Pattern => {
      // UIA patterns only — fail if not supported
      unsafe {
        let _com_init = crate::utils::ComScope::init();
        if let Ok(automation) = create_uia() {
          if let Ok(element) = automation.ElementFromHandle(hwnd) {
            if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId) {
              pattern.Invoke().map_err(|err| {
                Error::from(AutomationError::Generic {
                  message: format!("Invoke failed: {err}"),
                })
              })?;
              return Ok(());
            }
          }
        }
      }
      Err(Error::from(AutomationError::Generic {
        message: "UIA InvokePattern not available for this element in pattern mode".into(),
      }))
    }

    crate::patterns::InputMode::Hardware => {
      // Hardware-only: use enigo-based click (or fallback to SendInput)
      #[cfg(feature = "input-hardware")]
      {
        return crate::hardware_input::hardware_click(element_handle);
      }
      #[cfg(not(feature = "input-hardware"))]
      {
        hardware_click_sendinput(element_handle).await
      }
    }

    crate::patterns::InputMode::Auto => {
      // Auto: try UIA first, fallback to hardware
      let mut cursor_set = false;
      unsafe {
        let _com_init = crate::utils::ComScope::init();
        if let Ok(automation) = create_uia() {
          if let Ok(element) = automation.ElementFromHandle(hwnd) {
            if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId) {
              pattern.Invoke().map_err(|err| {
                Error::from(AutomationError::Generic {
                  message: format!("Invoke failed: {err}"),
                })
              })?;
              return Ok(());
            }
            if let Ok(rect) = element.CurrentBoundingRectangle() {
              let cx = (rect.left + rect.right) / 2;
              let cy = (rect.top + rect.bottom) / 2;
              SetCursorPos(cx, cy).map_err(|_| {
                Error::from(AutomationError::Generic {
                  message: "Failed to set cursor position".into(),
                })
              })?;
              cursor_set = true;
            }
          }
        }
      }
      if !cursor_set {
        tracing::warn!("UIA failed for hwnd={element_handle}, falling back to Win32 click");
        let mut rect = RECT::default();
        unsafe {
          if GetWindowRect(hwnd, &mut rect).is_err() {
            return Err(Error::from(AutomationError::ScreenshotFailed {
              handle: element_handle.clone(),
              reason: "Failed to get window rect".into(),
            }));
          }
        }
        let cx = (rect.left + rect.right) / 2;
        let cy = (rect.top + rect.bottom) / 2;
        unsafe {
          SetCursorPos(cx, cy).map_err(|_| {
            Error::from(AutomationError::Generic {
              message: "Failed to set cursor position".into(),
            })
          })?;
        }
      }
      tokio::time::sleep(std::time::Duration::from_millis(30)).await;
      send_mouse_click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP).await;
      Ok(())
    }
  }
}

/// Hardware-only click via SendInput (used when input-hardware feature is off).
async fn hardware_click_sendinput(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let mut rect = RECT::default();
  unsafe {
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(Error::from(AutomationError::ScreenshotFailed {
        handle: element_handle,
        reason: "Failed to get window rect".into(),
      }));
    }
    let cx = (rect.left + rect.right) / 2;
    let cy = (rect.top + rect.bottom) / 2;
    SetCursorPos(cx, cy).map_err(|_| {
      Error::from(AutomationError::Generic {
        message: "Failed to set cursor position".into(),
      })
    })?;
  }
  tokio::time::sleep(std::time::Duration::from_millis(30)).await;
  send_mouse_click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP).await;
  Ok(())
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
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    let hwnd = parse_hwnd(&window_handle)?;
    let root = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: "".into() }))?;

    let query_lower = name.to_ascii_lowercase();
    if find_and_invoke_by_name(&automation, &root, &query_lower)? {
      return Ok(());
    }
    Err(Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: name.clone() }))
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
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    let hwnd = parse_hwnd(&window_handle)?;
    let root = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: "".into() }))?;

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
                    return Err(Error::from(AutomationError::Generic { message: format!(
                      "Failed to invoke '{}': {}", names[j], err
                    ) }));
                  }
                  remaining[j] = false;
                  break;
                }
              }
            }
            if remaining[j] {
              return Err(Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: names[j].clone() }));
            }
          }
        }
      }
    }

    // Check for any remaining unfound names.
    for j in 0..total {
      if remaining[j] {
        return Err(Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: names[j].clone() }));
      }
    }
  }

  Ok(())
}

#[napi(object)]
pub struct ElementPathStep {
  pub role: String,
  pub name: String,
  pub automation_id: String,
  pub class_name: String,
  pub sibling_index: i32,
}

#[napi(js_name = "buildElementPath")]
pub fn build_element_path(element_handle: String) -> Result<Vec<ElementPathStep>> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia()?;
    let true_condition = automation.CreateTrueCondition()
      .map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let walker = automation.CreateTreeWalker(&true_condition)
      .map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    let mut path: Vec<ElementPathStep> = Vec::new();
    let mut current = automation.ElementFromHandle(hwnd)
      .map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;

    loop {
      // Read properties of current element
      let role = current.CurrentAriaRole()
        .ok().map(|s| s.to_string()).unwrap_or_default();
      let name = current.CurrentName()
        .ok().map(|s| s.to_string()).unwrap_or_default();
      let automation_id = current.CurrentAutomationId()
        .ok().map(|s| s.to_string()).unwrap_or_default();
      let class_name = current.CurrentClassName()
        .ok().map(|s| s.to_string()).unwrap_or_default();

      // Get parent
      let parent = walker.GetParentElement(&current);
      match parent {
        Ok(parent_element) => {
          // Find sibling index by enumerating all parent's children
          let mut sibling_index = 0i32;
          if let Ok(children) = parent_element.FindAll(TreeScope_Children, &true_condition) {
            if let Ok(length) = children.Length() {
              for i in 0..length {
                if let Ok(child) = children.GetElement(i) {
                  // Compare handles
                  if let Ok(child_hwnd) = child.CurrentNativeWindowHandle() {
                    if let Ok(current_hwnd) = current.CurrentNativeWindowHandle() {
                      if child_hwnd == current_hwnd {
                        sibling_index = i as i32;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }

          path.push(ElementPathStep {
            role,
            name,
            automation_id,
            class_name,
            sibling_index,
          });

          current = parent_element;
        }
        Err(_) => {
          // No parent — add final step and stop
          path.push(ElementPathStep {
            role,
            name,
            automation_id,
            class_name,
            sibling_index: 0,
          });
          break;
        }
      }

      if path.len() > 100 {
        break; // Safety limit
      }
    }

    // Path is built from target up to root — reverse for root→target order
    path.reverse();
    Ok(path)
  }
}

#[napi(js_name = "resolveElementPath")]
pub async fn resolve_element_path(window_handle: String, path: Vec<ElementPathStep>) -> Result<Option<String>> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia()?;
    let true_condition = automation.CreateTrueCondition()
      .map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;

    let mut current = automation.ElementFromHandle(hwnd)
      .map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: "".into() }))?;

    for step in &path {
      let mut found = false;
      if let Ok(children) = current.FindAll(TreeScope_Children, &true_condition) {
        if let Ok(length) = children.Length() {
          for i in 0..length {
            if let Ok(child) = children.GetElement(i) {
              // Match by properties
              let matches = {
                let child_role = child.CurrentAriaRole()
                  .ok().map(|s| s.to_string()).unwrap_or_default();
                let child_name = child.CurrentName()
                  .ok().map(|s| s.to_string()).unwrap_or_default();
                let child_aid = child.CurrentAutomationId()
                  .ok().map(|s| s.to_string()).unwrap_or_default();
                let child_class = child.CurrentClassName()
                  .ok().map(|s| s.to_string()).unwrap_or_default();

                // Use sibling index if properties are ambiguous
                if !step.role.is_empty() && child_role != step.role { continue; }
                if !step.name.is_empty() && child_name != step.name { continue; }
                if !step.automation_id.is_empty() && child_aid != step.automation_id { continue; }
                if !step.class_name.is_empty() && child_class != step.class_name { continue; }

                // If all properties match, check sibling index
                if i as i32 == step.sibling_index {
                  true
                } else {
                  // If sibling index doesn't match but properties do, this might still be the right element
                  // if the tree structure changed. Use properties only as fallback.
                  false
                }
              };

              if matches {
                current = child;
                found = true;
                break;
              }
            }
          }
        }
      }

      if !found {
        return Ok(None);
      }
    }

    let result_hwnd = current.CurrentNativeWindowHandle().ok();
    Ok(result_hwnd.map(|h| hwnd_to_string(h)))
  }
}

#[napi(js_name = "hoverElement")]
pub async fn hover_element(element_handle: String) -> Result<()> {
  debug!("hoverElement hwnd={element_handle}");
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    // Try UIA bounding rectangle first (better for UWP/modern apps)
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        if let Ok(rect) = element.CurrentBoundingRectangle() {
          let cx = (rect.left + rect.right) / 2;
          let cy = (rect.top + rect.bottom) / 2;
          SetCursorPos(cx, cy).map_err(|_| Error::from(AutomationError::Generic { message: "Failed to set cursor position".into() }))?;
          return Ok(());
        }
      }
    }
  }
  // Fallback: Win32 GetWindowRect
  tracing::warn!("UIA bounding rect failed for hwnd={element_handle}, falling back to Win32 GetWindowRect");
  unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: element_handle.clone(), reason: "Failed to get window rectangle".into() }));
    }
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    SetCursorPos(center_x, center_y).map_err(|_| Error::from(AutomationError::Generic { message: "Failed to set cursor position".into() }))?;
  }
  Ok(())
}

#[napi(js_name = "scrollElement")]
pub async fn scroll_element(element_handle: String, direction: String, amount: i32) -> Result<()> {
  debug!("scrollElement hwnd={element_handle} direction={direction} amount={amount}");
  let hwnd = parse_hwnd(&element_handle)?;
  let (wparam, msg) = match direction.as_str() {
    "up" => (WPARAM(0), WM_VSCROLL),
    "down" => (WPARAM(1), WM_VSCROLL),
    "left" => (WPARAM(0), WM_HSCROLL),
    "right" => (WPARAM(1), WM_HSCROLL),
    _ => return Err(Error::from(AutomationError::Generic { message: format!("Invalid scroll direction: {direction}") })),
  };

  unsafe {
    for _ in 0..amount {
      SendMessageW(hwnd, msg, Some(wparam), Some(LPARAM(0)));
    }
  }
  Ok(())
}

#[napi(js_name = "getValue")]
pub async fn get_value(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;
    let pattern: IUIAutomationValuePattern = element
      .GetCurrentPatternAs(UIA_ValuePatternId)
      .map_err(|_err| Error::from(AutomationError::PatternNotSupported { handle: element_handle.clone(), pattern: "ValuePattern" }))?;
    let value = pattern.CurrentValue().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to get value: {err}") }))?;
    Ok(value.to_string())
  }
}

#[napi(js_name = "setValue")]
pub async fn set_value(element_handle: String, value: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;
    let pattern: IUIAutomationValuePattern = element
      .GetCurrentPatternAs(UIA_ValuePatternId)
      .map_err(|_err| Error::from(AutomationError::PatternNotSupported { handle: element_handle.clone(), pattern: "ValuePattern" }))?;
    let bstr: BSTR = value.into();
    pattern.SetValue(&bstr).map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to set value: {err}") }))?;
  }
  Ok(())
}

#[napi(js_name = "selectElement")]
pub async fn select_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;
    let pattern: IUIAutomationSelectionItemPattern = element
      .GetCurrentPatternAs(UIA_SelectionItemPatternId)
      .map_err(|_err| Error::from(AutomationError::PatternNotSupported { handle: element_handle.clone(), pattern: "SelectionItemPattern" }))?;
    pattern.Select().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to select element: {err}") }))?;
  }
  Ok(())
}

#[napi(js_name = "toggleElement")]
pub async fn toggle_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;
    let pattern: IUIAutomationTogglePattern = element
      .GetCurrentPatternAs(UIA_TogglePatternId)
      .map_err(|_err| Error::from(AutomationError::PatternNotSupported { handle: element_handle.clone(), pattern: "TogglePattern" }))?;
    pattern.Toggle().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to toggle element: {err}") }))?;
  }
  Ok(())
}

#[napi(js_name = "getToggleState")]
pub async fn get_toggle_state(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let element = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;
    let pattern: IUIAutomationTogglePattern = element
      .GetCurrentPatternAs(UIA_TogglePatternId)
      .map_err(|_err| Error::from(AutomationError::PatternNotSupported { handle: element_handle.clone(), pattern: "TogglePattern" }))?;
    let state = pattern.CurrentToggleState().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to get toggle state: {err}") }))?;
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
  automation_id: Option<String>,
  name: Option<String>,
  role: Option<String>,
  class_name: Option<String>,
  text: Option<String>,
  match_mode: Option<String>,
) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&window_handle)?;
  let mut results: Vec<HWND> = Vec::new();
  let mm = match_mode.as_deref().unwrap_or("substring");

  // Build the class list from class_names and className
  let mut classes = class_names.unwrap_or_default();
  if let Some(ref cn) = class_name {
    if !classes.iter().any(|c| c.eq_ignore_ascii_case(cn)) {
      classes.push(cn.clone());
    }
  }

  // HWND class-based collection
  if !classes.is_empty() {
    fn collect_by_class(parent: HWND, classes: &[String], out: &mut Vec<HWND>) {
      unsafe {
        let mut child = FindWindowExW(Some(parent), None, None, None).ok();
        while let Some(current) = child {
          if current.is_invalid() { break; }
          let class_name = crate::utils::get_class_name(current);
          if classes.iter().any(|c| class_name.eq_ignore_ascii_case(c)) {
            if !out.iter().any(|h| h.0 == current.0) {
              out.push(current);
            }
          }
          collect_by_class(current, classes, out);
          child = FindWindowExW(Some(parent), Some(current), None, None).ok();
        }
      }
    }
    collect_by_class(hwnd, &classes, &mut results);
  }

  // UIA-based search for automationId, role, name, text
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    if let Ok(automation) = create_uia() {
      if let Ok(root) = automation.ElementFromHandle(hwnd) {
        // Fast path: try native PropertyConditions (non-regex modes only)
        if mm != "regex" {
          let mut cond_pairs: Vec<(UIA_PROPERTY_ID, &str)> = Vec::new();
          if let Some(ref val) = name {
            cond_pairs.push((UIA_NamePropertyId, val.as_str()));
          }
          if let Some(ref val) = role {
            cond_pairs.push((UIA_AriaRolePropertyId, val.as_str()));
          }
          if let Some(ref val) = automation_id {
            cond_pairs.push((UIA_AutomationIdPropertyId, val.as_str()));
          }
          // text maps to CurrentName() — add only if name is not already querying the same property
          if let Some(ref val) = text {
            if name.is_none() || name.as_deref() != Some(val.as_str()) {
              cond_pairs.push((UIA_NamePropertyId, val.as_str()));
            }
          }

          if !cond_pairs.is_empty() {
            let conditions: Vec<IUIAutomationCondition> = cond_pairs
              .into_iter()
              .filter_map(|(pid, val)| try_build_uia_condition(&automation, pid, val, mm))
              .collect();

            if !conditions.is_empty() {
              let composite = combine_and_conditions(&automation, conditions);
              if let Some(ref condition) = composite {
                if let Ok(all) = root.FindAll(TreeScope_Descendants, condition) {
                  if let Ok(length) = all.Length() {
                    for i in 0..length {
                      if let Ok(element) = all.GetElement(i) {
                        if !check_element_matches(&element, &automation_id, &name, &role, &text, mm) {
                          continue;
                        }
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

        // Slow path: FindAll(TrueCondition) + manual filter.
        // Needed for regex mode, or when all fast-path conditions failed to build,
        // or when no UIA-filterable properties were provided.
        if let Ok(true_condition) = automation.CreateTrueCondition() {
          if let Ok(all) = root.FindAll(TreeScope_Descendants, &true_condition) {
            if let Ok(length) = all.Length() {
              for i in 0..length {
                if let Ok(element) = all.GetElement(i) {
                  if !check_element_matches(&element, &automation_id, &name, &role, &text, mm) {
                    continue;
                  }
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

  Ok(results.into_iter().map(|h| hwnd_to_string(h)).collect())
}

// SAFETY: element is a valid IUIAutomationElement from FindAll/FindFirst;
// CurrentName/CurrentAriaRole/CurrentAutomationId are read-only COM property calls
// that follow the UIA COM ABI and return BSTR strings.
unsafe fn check_element_matches(
  element: &IUIAutomationElement,
  automation_id: &Option<String>,
  name: &Option<String>,
  role: &Option<String>,
  text: &Option<String>,
  mm: &str,
) -> bool {
  if let Some(query_name) = name {
    if let Ok(current_name) = element.CurrentName() {
      let current_name = current_name.to_string();
      if current_name.is_empty() || !match_mode_matches(&current_name, query_name, mm) {
        return false;
      }
    } else {
      return false;
    }
  }

  if let Some(query_role) = role {
    if let Ok(current_role) = element.CurrentAriaRole() {
      let current_role = current_role.to_string();
      if current_role.is_empty() || !match_mode_matches(&current_role, query_role, mm) {
        return false;
      }
    } else {
      return false;
    }
  }

  if let Some(query_aid) = automation_id {
    if let Ok(current_aid) = element.CurrentAutomationId() {
      let current_aid = current_aid.to_string();
      if current_aid.is_empty() || !match_mode_matches(&current_aid, query_aid, mm) {
        return false;
      }
    } else {
      return false;
    }
  }

  if let Some(query_text) = text {
    if let Ok(current_name) = element.CurrentName() {
      let current_name = current_name.to_string();
      if current_name.is_empty() || !match_mode_matches(&current_name, query_text, mm) {
        return false;
      }
    } else {
      return false;
    }
  }

  true
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
    let _com_init = crate::utils::ComScope::init();
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        let offscreen = element.CurrentIsOffscreen().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to get offscreen state: {err}") }))?;
        return Ok(!offscreen.as_bool());
      }
    }
    tracing::warn!("UIA isVisible failed for hwnd={element_handle}, falling back to Win32 IsWindowVisible");
    // Fallback to Win32
    Ok(IsWindowVisible(hwnd).as_bool())
  }
}

#[napi(js_name = "isEnabled")]
pub async fn is_element_enabled(element_handle: String) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        let enabled = element.CurrentIsEnabled().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to get enabled state: {err}") }))?;
        return Ok(enabled.as_bool());
      }
    }
    tracing::warn!("UIA isEnabled failed for hwnd={element_handle}, falling back to optimistic default (true)");
    Ok(true)
  }
}

#[napi(js_name = "isFocused")]
pub async fn is_element_focused(element_handle: String) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        let focused = element.CurrentHasKeyboardFocus().map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to get focus state: {err}") }))?;
        return Ok(focused.as_bool());
      }
    }
    Ok(false)
  }
}

#[napi(js_name = "focusElement")]
pub async fn focus_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation =
      create_uia().map_err(|err| Error::from(AutomationError::ComInitFailed { reason: err.to_string() }))?;
    let uia_element = automation
      .ElementFromHandle(hwnd)
      .map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;
    uia_element
      .SetFocus()
      .map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to set focus on element: {err}") }))?;
  }
  Ok(())
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
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: window_handle.clone(), reason: "Failed to get window rectangle".into() }));
    }
    Ok(WindowBounds {
      left: physical_to_logical(hwnd, rect.left),
      top: physical_to_logical(hwnd, rect.top),
      width: physical_to_logical(hwnd, rect.right - rect.left),
      height: physical_to_logical(hwnd, rect.bottom - rect.top),
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
    MoveWindow(
      hwnd,
      logical_to_physical(hwnd, left),
      logical_to_physical(hwnd, top),
      logical_to_physical(hwnd, width),
      logical_to_physical(hwnd, height),
      true,
    )
    .map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to set window bounds: {err}") }))?;
  }
  Ok(())
}

#[napi(js_name = "focusWindow")]
pub async fn focus_window(window_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_SHOW);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
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

use phf::phf_map;

static VK_MAP: phf::Map<&'static str, u16> = phf_map! {
  "cancel" => 0x03,
  "backspace" => 0x08, "back" => 0x08,
  "tab" => 0x09,
  "clear" => 0x0C,
  "enter" => 0x0D, "return" => 0x0D,
  "shift" => 0x10,
  "ctrl" => 0x11, "control" => 0x11,
  "alt" => 0x12, "menu" => 0x12,
  "pause" => 0x13,
  "capslock" => 0x14, "caps" => 0x14,
  "escape" => 0x1B, "esc" => 0x1B,
  "space" => 0x20, "spacebar" => 0x20,
  "pageup" => 0x21, "prior" => 0x21,
  "pagedown" => 0x22, "next" => 0x22,
  "end" => 0x23,
  "home" => 0x24,
  "left" => 0x25,
  "up" => 0x26,
  "right" => 0x27,
  "down" => 0x28,
  "select" => 0x29,
  "print" => 0x2C, "printscreen" => 0x2C, "prtsc" => 0x2C,
  "insert" => 0x2D, "ins" => 0x2D,
  "delete" => 0x2E, "del" => 0x2E,
  "help" => 0x2F,
  "0" => 0x30, "1" => 0x31, "2" => 0x32, "3" => 0x33, "4" => 0x34,
  "5" => 0x35, "6" => 0x36, "7" => 0x37, "8" => 0x38, "9" => 0x39,
  "a" => 0x41, "b" => 0x42, "c" => 0x43, "d" => 0x44, "e" => 0x45,
  "f" => 0x46, "g" => 0x47, "h" => 0x48, "i" => 0x49, "j" => 0x4A,
  "k" => 0x4B, "l" => 0x4C, "m" => 0x4D, "n" => 0x4E, "o" => 0x4F,
  "p" => 0x50, "q" => 0x51, "r" => 0x52, "s" => 0x53, "t" => 0x54,
  "u" => 0x55, "v" => 0x56, "w" => 0x57, "x" => 0x58, "y" => 0x59,
  "z" => 0x5A,
  "lwin" => 0x5B, "lcmd" => 0x5B, "lmeta" => 0x5B,
  "rwin" => 0x5C, "rcmd" => 0x5C, "rmeta" => 0x5C,
  "apps" => 0x5D,
  "sleep" => 0x5F,
  "numpad0" => 0x60, "numpad1" => 0x61, "numpad2" => 0x62, "numpad3" => 0x63,
  "numpad4" => 0x64, "numpad5" => 0x65, "numpad6" => 0x66, "numpad7" => 0x67,
  "numpad8" => 0x68, "numpad9" => 0x69,
  "multiply" => 0x6A, "*" => 0x6A,
  "add" => 0x6B, "+" => 0x6B,
  "separator" => 0x6C,
  "subtract" => 0x6D, "-" => 0x6D,
  "decimal" => 0x6E,
  "divide" => 0x6F,
  "f1" => 0x70, "f2" => 0x71, "f3" => 0x72, "f4" => 0x73,
  "f5" => 0x74, "f6" => 0x75, "f7" => 0x76, "f8" => 0x77,
  "f9" => 0x78, "f10" => 0x79, "f11" => 0x7A, "f12" => 0x7B,
  "f13" => 0x7C, "f14" => 0x7D, "f15" => 0x7E, "f16" => 0x7F,
  "f17" => 0x80, "f18" => 0x81, "f19" => 0x82, "f20" => 0x83,
  "f21" => 0x84, "f22" => 0x85, "f23" => 0x86, "f24" => 0x87,
  "numlock" => 0x90,
  "scrolllock" => 0x91, "scroll" => 0x91,
  "lshift" => 0xA0,
  "rshift" => 0xA1,
  "lctrl" => 0xA2, "lcontrol" => 0xA2,
  "rctrl" => 0xA3, "rcontrol" => 0xA3,
  "lalt" => 0xA4, "lmenu" => 0xA4,
  "ralt" => 0xA5, "rmenu" => 0xA5,
  "semicolon" => 0xBA, ";" => 0xBA,
  "plus" => 0xBB, "=" => 0xBB,
  "comma" => 0xBC, "," => 0xBC,
  "minus" => 0xBD, "_" => 0xBD,
  "period" => 0xBE, "." => 0xBE,
  "slash" => 0xBF, "/" => 0xBF, "?" => 0xBF,
  "tilde" => 0xC0, "`" => 0xC0, "~" => 0xC0,
  "lbracket" => 0xDB, "[" => 0xDB, "{" => 0xDB,
  "backslash" => 0xDC, "\\" => 0xDC, "|" => 0xDC,
  "rbracket" => 0xDD, "]" => 0xDD, "}" => 0xDD,
  "quote" => 0xDE, "'" => 0xDE, "\"" => 0xDE,
};

fn vk_from_name(name: &str) -> Option<u16> {
  VK_MAP.get(name.to_ascii_lowercase().as_str()).copied()
}

fn send_key_code(vk: u16, flags: KEYBD_EVENT_FLAGS) {
  // SAFETY: SendInput with a properly initialized INPUT_KEYBOARD structure is safe;
  // the INPUT struct is initialized with valid VIRTUAL_KEY and flags, and size_of<INPUT>
  // matches what the OS expects.
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

async fn send_char_key(vk: u16) {
  send_key_down(vk);
  tokio::time::sleep(std::time::Duration::from_millis(5)).await;
  send_key_up(vk);
}

#[napi(js_name = "pressKey")]
pub async fn press_key(window_handle: String, key_combination: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;

  let parts: Vec<&str> = key_combination.split('+').map(|s| s.trim()).collect();
  if parts.is_empty() {
    return Err(Error::from(AutomationError::Generic { message: "Empty key combination".into() }));
  }

  let main_key = parts.last().ok_or_else(|| Error::from(AutomationError::Generic { message: "No main key in combination".into() }))?;
  let main_vk = vk_from_name(main_key)
    .ok_or_else(|| Error::from(AutomationError::Generic { message: format!("Unknown key: {main_key}") }))?;

  let mut modifier_keys = Vec::new();
  for i in 0..parts.len().saturating_sub(1) {
    let mod_name = parts[i];
    let mod_vk = vk_from_name(mod_name)
      .ok_or_else(|| Error::from(AutomationError::Generic { message: format!("Unknown modifier: {mod_name}") }))?;
    modifier_keys.push(mod_vk);
  }

  for &vk in &modifier_keys {
    send_key_down(vk);
  }
  tokio::time::sleep(std::time::Duration::from_millis(10)).await;
  send_char_key(main_vk).await;
  tokio::time::sleep(std::time::Duration::from_millis(10)).await;
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

#[allow(dead_code)]
fn make_mouse_move_input(dx: i32, dy: i32) -> INPUT {
  INPUT {
    r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_MOUSE,
    Anonymous: INPUT_0 {
      mi: MOUSEINPUT {
        dx,
        dy,
        mouseData: 0,
        dwFlags: MOUSEEVENTF_MOVE,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  }
}

async fn send_mouse_click(flags_down: MOUSE_EVENT_FLAGS, flags_up: MOUSE_EVENT_FLAGS) {
  // SAFETY: SendInput with properly initialized INPUT_MOUSE structures is safe;
  // the MOUSEINPUT struct is zero-initialized from make_mouse_input with valid dwFlags.
  unsafe {
    SendInput(
      &[make_mouse_input(flags_down.0)],
      std::mem::size_of::<INPUT>() as i32,
    );
  }
  tokio::time::sleep(std::time::Duration::from_millis(10)).await;
  unsafe {
    SendInput(
      &[make_mouse_input(flags_up.0)],
      std::mem::size_of::<INPUT>() as i32,
    );
  }
}

#[napi(js_name = "rightClickElement")]
pub async fn right_click_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let mut rect = RECT::default();
  unsafe {
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: element_handle.clone(), reason: "Failed to get window rectangle".into() }));
    }
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    SetCursorPos(center_x, center_y)
      .map_err(|_| Error::from(AutomationError::Generic { message: "Failed to set cursor position".into() }))?;
  }
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  send_mouse_click(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP).await;
  Ok(())
}

#[napi(js_name = "doubleClickElement")]
pub async fn double_click_element(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let mut rect = RECT::default();
  unsafe {
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: element_handle.clone(), reason: "Failed to get window rectangle".into() }));
    }
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    SetCursorPos(center_x, center_y)
      .map_err(|_| Error::from(AutomationError::Generic { message: "Failed to set cursor position".into() }))?;
  }
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  // Two quick left clicks
  send_mouse_click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP).await;
  tokio::time::sleep(std::time::Duration::from_millis(30)).await;
  send_mouse_click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP).await;
  Ok(())
}

#[napi(js_name = "mouseMove")]
pub async fn mouse_move(x: i32, y: i32) -> Result<()> {
  // SAFETY: SetCursorPos takes absolute screen coordinates; no preconditions required.
  unsafe {
    SetCursorPos(x, y)
      .map_err(|_| Error::from(AutomationError::Generic { message: "Failed to set cursor position".into() }))?;
  }
  Ok(())
}

#[napi(js_name = "clickAt")]
pub async fn click_at(x: i32, y: i32) -> Result<()> {
  // SAFETY: SetCursorPos takes absolute screen coordinates; no preconditions required.
  unsafe {
    SetCursorPos(x, y)
      .map_err(|_| Error::from(AutomationError::Generic { message: "Failed to set cursor position".into() }))?;
  }
  tokio::time::sleep(std::time::Duration::from_millis(30)).await;
  send_mouse_click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP).await;
  Ok(())
}

#[napi(js_name = "keyDown")]
pub async fn key_down(window_handle: String, key: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  let vk = vk_from_name(&key)
    .ok_or_else(|| Error::from(AutomationError::Generic { message: format!("Unknown key: {key}") }))?;
  send_key_down(vk);
  Ok(())
}

#[napi(js_name = "keyUp")]
pub async fn key_up(window_handle: String, key: String) -> Result<()> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  let vk = vk_from_name(&key)
    .ok_or_else(|| Error::from(AutomationError::Generic { message: format!("Unknown key: {key}") }))?;
  send_key_up(vk);
  Ok(())
}

#[napi(js_name = "selectText")]
pub async fn select_text(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    // Try UIA TextPattern first
    if let Ok(automation) = create_uia() {
      if let Ok(element) = automation.ElementFromHandle(hwnd) {
        if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
          if let Ok(range) = pattern.DocumentRange() {
            let _ = range.Select();
            return Ok(());
          }
        }
      }
    }
  }
  // Fallback: focus + Ctrl+A
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
  }
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  send_key_down(0x11); // VK_CONTROL
  send_char_key(0x41).await; // 'A'
  send_key_up(0x11); // VK_CONTROL
  Ok(())
}

fn get_uia_text_selection(hwnd: HWND) -> Option<String> {
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia().ok()?;
    let element = automation.ElementFromHandle(hwnd).ok()?;
    let pattern = element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId).ok()?;
    let ranges = pattern.GetSelection().ok()?;
    let length = ranges.Length().ok()?;
    let mut texts: Vec<String> = Vec::new();
    for i in 0..length {
      if let Ok(range) = ranges.GetElement(i) {
        if let Ok(text) = range.GetText(1024) {
          texts.push(text.to_string());
        }
      }
    }
    if texts.is_empty() { None } else { Some(texts.join("")) }
  }
}

#[napi(js_name = "getSelection")]
pub async fn get_selection(element_handle: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  if let Some(selection) = get_uia_text_selection(hwnd) {
    return Ok(selection);
  }
  Ok(String::new())
}

#[napi(js_name = "replaceSelectedText")]
pub async fn replace_selected_text(element_handle: String, text: String) -> Result<()> {
  // Select all text first (UIA or Ctrl+A fallback) — hwnd must not cross await boundary
  let _ = select_text(element_handle.clone()).await;

  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _ = ShowWindow(hwnd, SW_NORMAL);
    SwitchToThisWindow(hwnd, true);
    let _ = SetForegroundWindow(hwnd);
  }
  let _ = hwnd;
  tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  let hwnd = parse_hwnd(&element_handle)?;
  let wide = to_wide_null_terminated(&text);
  unsafe {
    SendMessageW(hwnd, WM_SETTEXT, Some(WPARAM(0)), Some(LPARAM(wide.as_ptr() as isize)));
  }
  Ok(())
}

#[napi(object)]
pub struct ElementNode {
  pub handle: String,
  pub name: String,
  pub role: String,
  pub automation_id: String,
  pub is_visible: bool,
  pub is_enabled: bool,
  pub children: Vec<ElementNode>,
}

fn build_element_tree(
  element: IUIAutomationElement,
  automation: &IUIAutomation,
  max_depth: i32,
) -> ElementNode {
  // SAFETY: element and automation are valid UIA COM objects obtained from create_uia();
  // Current* property reads and FindAll follow the UIA COM ABI. all.GetElement returns
  // IUIAutomationElement with correct ref counting.
  unsafe {
    let handle = element.CurrentNativeWindowHandle()
      .ok().map(|h| hwnd_to_string(h)).unwrap_or_default();
    let name = element.CurrentName()
      .ok().map(|s| s.to_string()).unwrap_or_default();
    let role = element.CurrentAriaRole()
      .ok().map(|s| s.to_string()).unwrap_or_default();
    let auto_id = element.CurrentAutomationId()
      .ok().map(|s| s.to_string()).unwrap_or_default();
    let is_visible = element.CurrentIsOffscreen()
      .ok().map(|v| !v.as_bool()).unwrap_or(false);
    let is_enabled = element.CurrentIsEnabled()
      .ok().map(|v| v.as_bool()).unwrap_or(true);

    let mut children = Vec::new();
    if max_depth > 0 {
      if let Ok(true_cond) = automation.CreateTrueCondition() {
        if let Ok(all) = element.FindAll(TreeScope_Children, &true_cond) {
          if let Ok(length) = all.Length() {
            for i in 0..length {
              if let Ok(child) = all.GetElement(i) {
                children.push(build_element_tree(child, automation, max_depth - 1));
              }
            }
          }
        }
      }
    }

    ElementNode { handle, name, role, automation_id: auto_id, is_visible, is_enabled, children }
  }
}

#[napi(js_name = "inspectWindowTree")]
pub fn inspect_window_tree(window_handle: String, max_depth: Option<i32>) -> Result<Vec<ElementNode>> {
  let hwnd = parse_hwnd(&window_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia()?;
    let root = automation.ElementFromHandle(hwnd)
      .map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: window_handle.clone(), selector: "".into() }))?;
    let depth = max_depth.unwrap_or(10);
    let mut result = Vec::new();
    if let Ok(true_cond) = automation.CreateTrueCondition() {
      if let Ok(all) = root.FindAll(TreeScope_Children, &true_cond) {
        if let Ok(length) = all.Length() {
          for i in 0..length {
            if let Ok(child) = all.GetElement(i) {
              result.push(build_element_tree(child, &automation, depth));
            }
          }
        }
      }
    }
    Ok(result)
  }
}

fn get_legacy_accessible_name(element: &IUIAutomationElement) -> Option<String> {
  unsafe {
    if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(
      UIA_LegacyIAccessiblePatternId,
    ) {
      pattern.CurrentName().ok().map(|s| s.to_string())
    } else {
      None
    }
  }
}

fn get_legacy_accessible_role(element: &IUIAutomationElement) -> Option<String> {
  unsafe {
    if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(
      UIA_LegacyIAccessiblePatternId,
    ) {
      pattern.CurrentRole().ok().map(|v| v.to_string())
    } else {
      None
    }
  }
}

fn get_legacy_accessible_state(element: &IUIAutomationElement) -> Option<String> {
  unsafe {
    if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(
      UIA_LegacyIAccessiblePatternId,
    ) {
      pattern.CurrentState().ok().map(|v| v.to_string())
    } else {
      None
    }
  }
}

#[napi(js_name = "getElementAttribute")]
pub async fn get_element_attribute(element_handle: String, attribute_name: String) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com_init = crate::utils::ComScope::init();
    let automation = create_uia()?;
    let element = automation.ElementFromHandle(hwnd).map_err(|_err| Error::from(AutomationError::ElementNotFound { handle: element_handle.clone(), selector: "".into() }))?;

    let attr = attribute_name.to_ascii_lowercase().replace("_", "");
    let result = match attr.as_str() {
      "name" => {
        // Try standard CurrentName() first, fallback to LegacyIAccessible::Name
        if let Ok(name) = element.CurrentName() {
          let name = name.to_string();
          if !name.is_empty() {
            Some(name)
          } else {
            get_legacy_accessible_name(&element)
          }
        } else {
          get_legacy_accessible_name(&element)
        }
      }
      "legacyname" => get_legacy_accessible_name(&element),
      "automationid" => element.CurrentAutomationId().ok().map(|s| s.to_string()),
      "role" | "ariarole" => element.CurrentAriaRole().ok().map(|s| s.to_string()),
      "helptext" => element.CurrentHelpText().ok().map(|s| s.to_string()),
      "classname" => element.CurrentClassName().ok().map(|s| s.to_string()),
      "accesskey" => element.CurrentAccessKey().ok().map(|s| s.to_string()),
      "acceleratorkey" => element.CurrentAcceleratorKey().ok().map(|s| s.to_string()),
      "itemtype" => element.CurrentItemType().ok().map(|s| s.to_string()),
      "itemstatus" => element.CurrentItemStatus().ok().map(|s| s.to_string()),
      "culture" => element.CurrentCulture().ok().map(|v| v.to_string()),
      "isenabled" => element.CurrentIsEnabled().ok().map(|v| v.as_bool().to_string()),
      "isoffscreen" => element.CurrentIsOffscreen().ok().map(|v| v.as_bool().to_string()),
      "haskeyboardfocus" => element.CurrentHasKeyboardFocus().ok().map(|v| v.as_bool().to_string()),
      "ispassword" => element.CurrentIsPassword().ok().map(|v| v.as_bool().to_string()),
      "isrequiredforform" => element.CurrentIsRequiredForForm().ok().map(|v| v.as_bool().to_string()),
      "iscontrolelement" => element.CurrentIsControlElement().ok().map(|v| v.as_bool().to_string()),
      "iscontentelement" => element.CurrentIsContentElement().ok().map(|v| v.as_bool().to_string()),
      "legacyrole" => get_legacy_accessible_role(&element),
      "legacystate" => get_legacy_accessible_state(&element),
      "processid" => element.CurrentProcessId().ok().map(|v| v.to_string()),
      "boundingrectangle" | "bounds" => {
        element.CurrentBoundingRectangle().ok().map(|rect| {
          format!("{},{},{},{}", rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
        })
      }
      "localizedcontroltype" => element.CurrentLocalizedControlType().ok().map(|s| s.to_string()),
      "value" => {
        // Try ValuePattern first
        if let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
          if let Ok(value) = pattern.CurrentValue() {
            let text = value.to_string();
            if !text.is_empty() {
              return Ok(text);
            }
          }
        }
        // Fallback: WM_GETTEXT
        let len = SendMessageW(hwnd, WM_GETTEXT, Some(WPARAM(0)), Some(LPARAM(0))).0;
        if len > 0 {
          let mut buffer = vec![0u16; (len + 1) as usize];
          let copied = SendMessageW(hwnd, WM_GETTEXT, Some(WPARAM(buffer.len() as _)), Some(LPARAM(buffer.as_mut_ptr() as isize)));
          if copied.0 > 0 {
            return Ok(String::from_utf16_lossy(&buffer[..copied.0 as usize]));
          }
        }
        Some(String::new())
      }
      _ => return Err(Error::from(AutomationError::Generic { message: format!("Unknown attribute: {attribute_name}") })),
    };

    result.ok_or_else(|| Error::from(AutomationError::Generic { message: format!("Failed to read attribute '{attribute_name}' from element") }))
  }
}

#[napi(js_name = "dragDrop")]
pub async fn drag_drop(from_element_handle: String, to_element_handle: String) -> Result<()> {
  // Try OLE-aware mode first; fall back to pure mouse simulation.
  let fh = from_element_handle.clone();
  let th = to_element_handle.clone();

  let result = tokio::task::spawn_blocking(move || {
    crate::ole_drag::mouse_simulation_drag_drop(&fh, &th, true)
  })
  .await;

  match result {
    Ok(Ok(())) => return Ok(()),
    Ok(Err(e)) => {
      // OLE-aware attempt failed – retry with pure mouse simulation
      tracing::warn!("dragDrop OLE-aware attempt failed, retrying with mouse: {e}");
    }
    Err(e) => {
      tracing::warn!("dragDrop blocking task join failed, retrying with mouse: {e}");
    }
  }

  let fh2 = from_element_handle;
  let th2 = to_element_handle;
  tokio::task::spawn_blocking(move || {
    crate::ole_drag::mouse_simulation_drag_drop(&fh2, &th2, false)
  })
  .await
  .map_err(|e| Error::from(AutomationError::Generic { message: format!("dragDrop task join failed: {e}") }))?
  .map_err(|e| Error::from(e))
}
