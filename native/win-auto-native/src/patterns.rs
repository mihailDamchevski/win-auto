//! UIA pattern bindings exported via napi.
//!
//! Each pattern is exposed as a standalone napi function operating on an
//! element handle string.  The TS side wraps these into convenient methods
//! on `Element` and handles input-mode dispatching.

use napi::{Error, Result};
use napi_derive::napi;
use windows::Win32::System::Com::*;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::*;

use crate::error::AutomationError;
use crate::utils::{hwnd_to_string, parse_hwnd, ComScope};

// ── Input mode ───────────────────────────────────────────────────────────

#[napi]
pub enum InputMode {
  /// Use UIA patterns only – fail if pattern is unavailable.
  Pattern = 0,
  /// Use Win32 / SendInput hardware simulation only.
  Hardware = 1,
  /// Try pattern first, fall back to hardware on PatternNotSupported.
  Auto = 2,
}

// ── Helpers ──────────────────────────────────────────────────────────────

fn get_uia_element(hwnd: HWND) -> std::result::Result<IUIAutomationElement, AutomationError> {
  unsafe {
    let _com = ComScope::init();
    let uia: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
      .map_err(|_| AutomationError::ComInitFailed { reason: "CUIAutomation CoCreateInstance failed".into() })?;
    uia.ElementFromHandle(hwnd)
      .map_err(|_| AutomationError::ElementNotFound {
        handle: format!("{}", hwnd.0 as isize),
        selector: "".into(),
      })
  }
}

// ── ExpandCollapsePattern ────────────────────────────────────────────────

#[napi]
pub fn expand_collapse_expand(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(UIA_ExpandCollapsePatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "ExpandCollapsePattern",
      }))?;
    pattern.Expand().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("ExpandCollapsePattern.Expand failed: {e}"),
    }))?;
  }
  Ok(())
}

#[napi]
pub fn expand_collapse_collapse(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(UIA_ExpandCollapsePatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "ExpandCollapsePattern",
      }))?;
    pattern.Collapse().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("ExpandCollapsePattern.Collapse failed: {e}"),
    }))?;
  }
  Ok(())
}

// ── ScrollPattern ────────────────────────────────────────────────────────

/// ScrollAmount enum values mapped from windows-rs UIA ScrollAmount:
///   0 = LargeDecrement, 1 = SmallDecrement, 2 = NoAmount, 3 = LargeIncrement, 4 = SmallIncrement
#[napi]
pub fn scroll_pattern_scroll(
  element_handle: String,
  horizontal_amount: i32,
  vertical_amount: i32,
) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationScrollPattern>(UIA_ScrollPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "ScrollPattern",
      }))?;
    pattern.Scroll(
      ScrollAmount(horizontal_amount),
      ScrollAmount(vertical_amount),
    ).map_err(|e| Error::from(AutomationError::Generic {
      message: format!("ScrollPattern.Scroll failed: {e}"),
    }))?;
  }
  Ok(())
}

#[napi]
pub fn scroll_pattern_set_scroll_percent(
  element_handle: String,
  horizontal_percent: f64,
  vertical_percent: f64,
) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationScrollPattern>(UIA_ScrollPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "ScrollPattern",
      }))?;
    pattern.SetScrollPercent(horizontal_percent, vertical_percent)
      .map_err(|e| Error::from(AutomationError::Generic {
        message: format!("ScrollPattern.SetScrollPercent failed: {e}"),
      }))?;
  }
  Ok(())
}

// ── RangeValuePattern ────────────────────────────────────────────────────

#[napi]
pub fn range_value_get_value(element_handle: String) -> Result<f64> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationRangeValuePattern>(UIA_RangeValuePatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "RangeValuePattern",
      }))?;
    let v = pattern.CurrentValue().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("RangeValuePattern.CurrentValue failed: {e}"),
    }))?;
    Ok(v)
  }
}

#[napi]
pub fn range_value_set_value(element_handle: String, value: f64) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationRangeValuePattern>(UIA_RangeValuePatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "RangeValuePattern",
      }))?;
    pattern.SetValue(value).map_err(|e| Error::from(AutomationError::Generic {
      message: format!("RangeValuePattern.SetValue failed: {e}"),
    }))?;
  }
  Ok(())
}

// ── WindowPattern (full) ─────────────────────────────────────────────────

/// WindowVisualState enum values: 0 = Normal, 1 = Maximized, 2 = Minimized
#[napi]
pub fn window_pattern_set_visual_state(element_handle: String, state: i32) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationWindowPattern>(UIA_WindowPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "WindowPattern",
      }))?;
    pattern.SetWindowVisualState(WindowVisualState(state))
      .map_err(|e| Error::from(AutomationError::Generic {
        message: format!("WindowPattern.SetWindowVisualState failed: {e}"),
      }))?;
  }
  Ok(())
}

#[napi]
pub fn window_pattern_wait_for_input_idle(element_handle: String, timeout_ms: i32) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationWindowPattern>(UIA_WindowPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "WindowPattern",
      }))?;
    let ok = pattern.WaitForInputIdle(timeout_ms)
      .map_err(|e| Error::from(AutomationError::Generic {
        message: format!("WindowPattern.WaitForInputIdle failed: {e}"),
      }))?;
    Ok(ok.as_bool())
  }
}

// ── SelectionPattern ─────────────────────────────────────────────────────

#[napi]
pub fn selection_get_selection(element_handle: String) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationSelectionPattern>(UIA_SelectionPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "SelectionPattern",
      }))?;
    let arr = pattern.GetCurrentSelection()
      .map_err(|e| Error::from(AutomationError::Generic {
        message: format!("SelectionPattern.GetCurrentSelection failed: {e}"),
      }))?;
    let len = arr.Length().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("SelectionPattern.GetCurrentSelection length: {e}"),
    }))?;
    let mut handles = Vec::with_capacity(len as usize);
    for i in 0..len {
      if let Ok(el) = arr.GetElement(i as i32) {
        if let Ok(h) = el.CurrentNativeWindowHandle() {
          handles.push(format!("0x{:X}", h.0 as isize));
        }
      }
    }
    Ok(handles)
  }
}

// ── GridPattern ───────────────────────────────────────────────────────────

/// Returns the row count for a grid element.
#[napi(js_name = "gridGetRowCount")]
pub fn grid_get_row_count(element_handle: String) -> Result<i32> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationGridPattern>(UIA_GridPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "GridPattern",
      }))?;
    let count = pattern.CurrentRowCount().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("GridPattern.CurrentRowCount failed: {e}"),
    }))?;
    Ok(count)
  }
}

/// Returns the column count for a grid element.
#[napi(js_name = "gridGetColumnCount")]
pub fn grid_get_column_count(element_handle: String) -> Result<i32> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationGridPattern>(UIA_GridPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "GridPattern",
      }))?;
    let count = pattern.CurrentColumnCount().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("GridPattern.CurrentColumnCount failed: {e}"),
    }))?;
    Ok(count)
  }
}

/// Returns the element handle at the specified row and column in a grid.
#[napi(js_name = "gridGetItem")]
pub fn grid_get_item(element_handle: String, row: i32, column: i32) -> Result<String> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationGridPattern>(UIA_GridPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle.clone(),
        pattern: "GridPattern",
      }))?;
    let item = pattern.GetItem(row, column).map_err(|e| Error::from(AutomationError::Generic {
      message: format!("GridPattern.GetItem({row}, {column}) failed: {e}"),
    }))?;
    let h = item.CurrentNativeWindowHandle().map_err(|_| Error::from(AutomationError::Generic {
      message: format!("GridPattern.GetItem({row}, {column}) returned element with no handle"),
    }))?;
    Ok(hwnd_to_string(h))
  }
}

// ── TablePattern ──────────────────────────────────────────────────────────

/// Returns row header element handles for a table element.
#[napi(js_name = "tableGetRowHeaders")]
pub fn table_get_row_headers(element_handle: String) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationTablePattern>(UIA_TablePatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "TablePattern",
      }))?;
    let arr = pattern.GetCurrentRowHeaders().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("TablePattern.GetCurrentRowHeaders failed: {e}"),
    }))?;
    let len = arr.Length().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("TablePattern.GetCurrentRowHeaders length: {e}"),
    }))?;
    let mut handles = Vec::with_capacity(len as usize);
    for i in 0..len {
      if let Ok(el) = arr.GetElement(i as i32) {
        if let Ok(h) = el.CurrentNativeWindowHandle() {
          handles.push(hwnd_to_string(h));
        }
      }
    }
    Ok(handles)
  }
}

/// Returns column header element handles for a table element.
#[napi(js_name = "tableGetColumnHeaders")]
pub fn table_get_column_headers(element_handle: String) -> Result<Vec<String>> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationTablePattern>(UIA_TablePatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "TablePattern",
      }))?;
    let arr = pattern.GetCurrentColumnHeaders().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("TablePattern.GetCurrentColumnHeaders failed: {e}"),
    }))?;
    let len = arr.Length().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("TablePattern.GetCurrentColumnHeaders length: {e}"),
    }))?;
    let mut handles = Vec::with_capacity(len as usize);
    for i in 0..len {
      if let Ok(el) = arr.GetElement(i as i32) {
        if let Ok(h) = el.CurrentNativeWindowHandle() {
          handles.push(hwnd_to_string(h));
        }
      }
    }
    Ok(handles)
  }
}

// ── SelectionItemPattern ──────────────────────────────────────────────────

#[napi(js_name = "selectionItemSelect")]
pub fn selection_item_select(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "SelectionItemPattern",
      }))?;
    pattern.Select().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("SelectionItemPattern.Select failed: {e}"),
    }))?;
  }
  Ok(())
}

#[napi(js_name = "selectionItemAddToSelection")]
pub fn selection_item_add_to_selection(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "SelectionItemPattern",
      }))?;
    pattern.AddToSelection().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("SelectionItemPattern.AddToSelection failed: {e}"),
    }))?;
  }
  Ok(())
}

#[napi(js_name = "selectionItemRemoveFromSelection")]
pub fn selection_item_remove_from_selection(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "SelectionItemPattern",
      }))?;
    pattern.RemoveFromSelection().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("SelectionItemPattern.RemoveFromSelection failed: {e}"),
    }))?;
  }
  Ok(())
}

#[napi(js_name = "selectionItemIsSelected")]
pub fn selection_item_is_selected(element_handle: String) -> Result<bool> {
  let hwnd = parse_hwnd(&element_handle)?;
  unsafe {
    let _com = ComScope::init();
    let element = get_uia_element(hwnd)?;
    let pattern = element
      .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
      .map_err(|_| Error::from(AutomationError::PatternNotSupported {
        handle: element_handle,
        pattern: "SelectionItemPattern",
      }))?;
    let selected = pattern.CurrentIsSelected().map_err(|e| Error::from(AutomationError::Generic {
      message: format!("SelectionItemPattern.CurrentIsSelected failed: {e}"),
    }))?;
    Ok(selected.as_bool())
  }
}
