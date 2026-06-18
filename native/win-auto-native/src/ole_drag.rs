//! Drag-drop automation with mode fallback.
//!
//! Modes:
//! - `"ole"` : initialise OLE on the worker thread so the OS fires OLE
//!             drag-drop events during mouse-input simulation.
//! - `"mouse"`: pure mouse-input simulation (no OLE interaction).

use std::thread;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::System::Ole::*;
use windows::Win32::UI::Input::KeyboardAndMouse::*;
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::error::AutomationError;

// ---------------------------------------------------------------------------
// Enhanced mouse-simulation drag-drop
// ---------------------------------------------------------------------------

/// Scope guard that calls `OleUninitialize` on drop if OLE was initialized.
struct OleGuard(bool);

impl OleGuard {
    fn new(init: bool) -> Self {
        if init {
            unsafe { let _ = OleInitialize(None); }
        }
        Self(init)
    }
}

impl Drop for OleGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { OleUninitialize(); }
        }
    }
}

/// Execute a drag-drop via mouse-input simulation.
///
/// If `try_ole` is `true`, OLE is first initialised on the worker thread so
/// the OS properly dispatches OLE drag-drop events to the target window
/// during the mouse simulation.
pub fn mouse_simulation_drag_drop(
    from_element_handle: &str,
    to_element_handle: &str,
    try_ole: bool,
) -> std::result::Result<(), AutomationError> {
    let from_hwnd = parse_hwnd_internal(from_element_handle)?;
    let to_hwnd = parse_hwnd_internal(to_element_handle)?;

    let _ole = OleGuard::new(try_ole);

    unsafe {
        // ── geometry ───────────────────────────────────────────────
        let mut from_rect = RECT::default();
        if GetWindowRect(from_hwnd, &mut from_rect).is_err() {
            return Err(AutomationError::Generic {
                message: format!("dragDrop: failed to get source rect from {from_element_handle}"),
            });
        }
        let from_x = (from_rect.left + from_rect.right) / 2;
        let from_y = (from_rect.top + from_rect.bottom) / 2;

        let mut to_rect = RECT::default();
        if GetWindowRect(to_hwnd, &mut to_rect).is_err() {
            return Err(AutomationError::Generic {
                message: format!("dragDrop: failed to get target rect from {to_element_handle}"),
            });
        }
        let to_x = (to_rect.left + to_rect.right) / 2;
        let to_y = (to_rect.top + to_rect.bottom) / 2;

        // ── mouse input structs ─────────────────────────────────────
        let mouse_down = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSE_EVENT_FLAGS(MOUSEEVENTF_LEFTDOWN.0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let mouse_up = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSE_EVENT_FLAGS(MOUSEEVENTF_LEFTUP.0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        // ── execute ────────────────────────────────────────────────
        // 1. position at source
        SetCursorPos(from_x, from_y).map_err(|_| AutomationError::Generic {
            message: "dragDrop: failed to position cursor at source".into(),
        })?;
        thread::sleep(std::time::Duration::from_millis(60));

        // 2. press
        SendInput(&[mouse_down], std::mem::size_of::<INPUT>() as i32);
        thread::sleep(std::time::Duration::from_millis(80));

        // 3. smooth movement toward target
        let steps = 30u32;
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            let x = (from_x as f64 * (1.0 - t) + to_x as f64 * t) as i32;
            let y = (from_y as f64 * (1.0 - t) + to_y as f64 * t) as i32;
            let _ = SetCursorPos(x, y);
            thread::sleep(std::time::Duration::from_millis(8));
        }
        thread::sleep(std::time::Duration::from_millis(60));

        // 4. release
        SendInput(&[mouse_up], std::mem::size_of::<INPUT>() as i32);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_hwnd_internal(handle: &str) -> std::result::Result<HWND, AutomationError> {
    let cleaned = handle.trim_start_matches("0x").trim_start_matches("0X");
    let addr = isize::from_str_radix(cleaned, 16).map_err(|_| AutomationError::InvalidHandle {
        handle: handle.to_string(),
    })?;
    Ok(HWND(addr as *mut std::ffi::c_void))
}
