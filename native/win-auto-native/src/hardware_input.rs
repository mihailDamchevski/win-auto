//! Hardware-level input simulation via `enigo` (behind `input-hardware` feature).
//! Used by the "hardware" input mode to avoid UIA pattern dependency.

#[cfg(feature = "input-hardware")]
use enigo::{Button, Coordinate, Direction, Enigo, Key, Settings};
use napi::{Error, Result};
use napi_derive::napi;

use crate::error::AutomationError;
use crate::utils::parse_hwnd;

/// Click the center of a window/element via enigo hardware simulation.
#[cfg(feature = "input-hardware")]
fn hardware_click_inner(hwnd: windows::Win32::Foundation::HWND) -> Result<()> {
  use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
  let mut rect = windows::Win32::UI::WindowsAndMessaging::RECT::default();
  unsafe {
    let _ = GetWindowRect(hwnd, &mut rect);
  }
  let x = (rect.left + rect.right) / 2;
  let y = (rect.top + rect.bottom) / 2;
  let mut enigo =
    Enigo::new(&Settings::default()).map_err(|e| Error::from(AutomationError::Generic {
      message: format!("enigo init failed: {e}"),
    }))?;
  enigo
    .move_mouse(x as i32, y as i32, Coordinate::Abs)
    .map_err(|e| Error::from(AutomationError::Generic {
      message: format!("enigo move_mouse failed: {e}"),
    }))?;
  enigo
    .button(Button::Left, Direction::Click)
    .map_err(|e| Error::from(AutomationError::Generic {
      message: format!("enigo click failed: {e}"),
    }))?;
  Ok(())
}

#[cfg(not(feature = "input-hardware"))]
fn hardware_click_inner(_hwnd: windows::Win32::Foundation::HWND) -> Result<()> {
  Err(Error::from(AutomationError::Generic {
    message: "hardware input mode requires the 'input-hardware' feature".into(),
  }))
}

/// Hardware-level click at center of element.
#[napi(js_name = "hardwareClick")]
pub fn hardware_click(element_handle: String) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  hardware_click_inner(hwnd)
}

/// Type text via hardware keyboard simulation (enigo).
#[cfg(feature = "input-hardware")]
fn hardware_type_inner(text: &str) -> Result<()> {
  let mut enigo =
    Enigo::new(&Settings::default()).map_err(|e| Error::from(AutomationError::Generic {
      message: format!("enigo init failed: {e}"),
    }))?;
  enigo.text(text).map_err(|e| Error::from(AutomationError::Generic {
    message: format!("enigo text failed: {e}"),
  }))?;
  Ok(())
}

#[cfg(not(feature = "input-hardware"))]
fn hardware_type_inner(_text: &str) -> Result<()> {
  Err(Error::from(AutomationError::Generic {
    message: "hardware input mode requires the 'input-hardware' feature".into(),
  }))
}

/// Type text via hardware simulation.
#[napi(js_name = "hardwareTypeText")]
pub fn hardware_type_text(element_handle: String, text: String) -> Result<()> {
  let _hwnd = parse_hwnd(&element_handle)?;
  hardware_type_inner(&text)
}

/// Press a key combination (e.g. "ctrl+c") via hardware simulation.
#[cfg(feature = "input-hardware")]
fn hardware_press_key_inner(key_combination: &str) -> Result<()> {
  use enigo::{Key, Keyboard};

  let mut enigo =
    Enigo::new(&Settings::default()).map_err(|e| Error::from(AutomationError::Generic {
      message: format!("enigo init failed: {e}"),
    }))?;

  let parts: Vec<&str> = key_combination.split('+').collect();
  let mods = &parts[..parts.len() - 1];
  let main_key = parts.last().copied().unwrap_or("");

  // Press modifiers
  for m in mods {
    if let Some(key) = mod_to_key(m) {
      enigo.key(key, Direction::Press).map_err(|e| {
        Error::from(AutomationError::Generic {
          message: format!("enigo key press failed for {m}: {e}"),
        })
      })?;
    }
  }

  // Press + release main key
  if let Some(key) = str_to_key(main_key) {
    enigo.key(key, Direction::Click).map_err(|e| {
      Error::from(AutomationError::Generic {
        message: format!("enigo key click failed for {main_key}: {e}"),
      })
    })?;
  }

  // Release modifiers (reverse order)
  for m in mods.iter().rev() {
    if let Some(key) = mod_to_key(m) {
      enigo.key(key, Direction::Release).map_err(|e| {
        Error::from(AutomationError::Generic {
          message: format!("enigo key release failed for {m}: {e}"),
        })
      })?;
    }
  }

  Ok(())
}

#[cfg(not(feature = "input-hardware"))]
fn hardware_press_key_inner(_key_combination: &str) -> Result<()> {
  Err(Error::from(AutomationError::Generic {
    message: "hardware input mode requires the 'input-hardware' feature".into(),
  }))
}

#[napi(js_name = "hardwarePressKey")]
pub fn hardware_press_key(_window_handle: String, key_combination: String) -> Result<()> {
  hardware_press_key_inner(&key_combination)
}

// ── Key helpers ──────────────────────────────────────────────────────────

/// Map a modifier name string to an enigo Key.
#[cfg(feature = "input-hardware")]
fn mod_to_key(s: &str) -> Option<Key> {
  match s.to_lowercase().as_str() {
    "ctrl" | "control" => Some(Key::Control),
    "shift" => Some(Key::Shift),
    "alt" => Some(Key::Alt),
    "meta" | "win" | "super" => Some(Key::Meta),
    _ => None,
  }
}

/// Map a key name string to an enigo Key.
#[cfg(feature = "input-hardware")]
fn str_to_key(s: &str) -> Option<Key> {
  match s.to_lowercase().as_str() {
    "a" => Some(Key::A),
    "b" => Some(Key::B),
    "c" => Some(Key::C),
    "d" => Some(Key::D),
    "e" => Some(Key::E),
    "f" => Some(Key::F),
    "g" => Some(Key::G),
    "h" => Some(Key::H),
    "i" => Some(Key::I),
    "j" => Some(Key::J),
    "k" => Some(Key::K),
    "l" => Some(Key::L),
    "m" => Some(Key::M),
    "n" => Some(Key::N),
    "o" => Some(Key::O),
    "p" => Some(Key::P),
    "q" => Some(Key::Q),
    "r" => Some(Key::R),
    "s" => Some(Key::S),
    "t" => Some(Key::T),
    "u" => Some(Key::U),
    "v" => Some(Key::V),
    "w" => Some(Key::W),
    "x" => Some(Key::X),
    "y" => Some(Key::Y),
    "z" => Some(Key::Z),
    "0" => Some(Key::Num0),
    "1" => Some(Key::Num1),
    "2" => Some(Key::Num2),
    "3" => Some(Key::Num3),
    "4" => Some(Key::Num4),
    "5" => Some(Key::Num5),
    "6" => Some(Key::Num6),
    "7" => Some(Key::Num7),
    "8" => Some(Key::Num8),
    "9" => Some(Key::Num9),
    "return" | "enter" => Some(Key::Return),
    "tab" => Some(Key::Tab),
    "space" => Some(Key::Space),
    "backspace" => Some(Key::Backspace),
    "escape" | "esc" => Some(Key::Escape),
    "delete" => Some(Key::Delete),
    "home" => Some(Key::Home),
    "end" => Some(Key::End),
    "pageup" => Some(Key::PageUp),
    "pagedown" => Some(Key::PageDown),
    "up" => Some(Key::UpArrow),
    "down" => Some(Key::DownArrow),
    "left" => Some(Key::LeftArrow),
    "right" => Some(Key::RightArrow),
    "f1" => Some(Key::F1),
    "f2" => Some(Key::F2),
    "f3" => Some(Key::F3),
    "f4" => Some(Key::F4),
    "f5" => Some(Key::F5),
    "f6" => Some(Key::F6),
    "f7" => Some(Key::F7),
    "f8" => Some(Key::F8),
    "f9" => Some(Key::F9),
    "f10" => Some(Key::F10),
    "f11" => Some(Key::F11),
    "f12" => Some(Key::F12),
    _ => None,
  }
}
