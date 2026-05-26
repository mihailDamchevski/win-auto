use std::sync::OnceLock;
use tokio::sync::oneshot;
use napi::{Result};
use napi_derive::napi;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
  BeginPaint, CreateSolidBrush, EndPaint, FillRect, HDC, HBRUSH, PAINTSTRUCT,
};
use windows::Win32::UI::WindowsAndMessaging::{
  CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
  GetWindowRect, PeekMessageW, RegisterClassW, ShowWindow, TranslateMessage,
  CS_HREDRAW, CS_VREDRAW, HMENU, HINSTANCE, MSG, PM_REMOVE, SW_SHOWNOACTIVATE,
  WINDOW_EX_STYLE, WINDOW_STYLE, WindowMessage, WS_EX_LAYERED, WS_EX_NOACTIVATE,
  WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_OVERLAPPED, WS_POPUP,
  WS_VISIBLE,
};

use crate::error::napi_error;
use crate::utils::parse_hwnd;

const HIGHLIGHT_CLASS_NAME: &str = "WinAutoHighlightOverlay\0";

static HIGHLIGHT_ATOM: OnceLock<u16> = OnceLock::new();

fn ensure_window_class() -> u16 {
  *HIGHLIGHT_ATOM.get_or_init(|| {
    let wide: Vec<u16> = HIGHLIGHT_CLASS_NAME.encode_utf16().collect();
    let wc = windows::Win32::UI::WindowsAndMessaging::WNDCLASSW {
      style: CS_HREDRAW | CS_VREDRAW,
      lpfnWndProc: Some(highlight_wndproc),
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance: HINSTANCE::default(),
      hIcon: windows::Win32::UI::WindowsAndMessaging::HICON::default(),
      hCursor: windows::Win32::UI::WindowsAndMessaging::HCURSOR::default(),
      hbrBackground: HBRUSH::default(),
      lpszMenuName: PCWSTR::null(),
      lpszClassName: PCWSTR(wide.as_ptr()),
    };
    unsafe { RegisterClassW(&wc) }
  })
}

unsafe extern "system" fn highlight_wndproc(
  hwnd: HWND,
  msg: u32,
  wparam: WPARAM,
  lparam: LPARAM,
) -> LRESULT {
  match msg {
    0x000F => { // WM_PAINT
      let mut ps = PAINTSTRUCT::default();
      let hdc = BeginPaint(hwnd, &mut ps);
      let mut rect = RECT::default();
      let _ = GetWindowRect(hwnd, &mut rect);
      let width = rect.right - rect.left;
      let height = rect.bottom - rect.top;
      rect.left = 0;
      rect.top = 0;
      rect.right = width;
      rect.bottom = height;

      let brush = CreateSolidBrush(0x0000FF); // red
      let border_brush = CreateSolidBrush(0x0000FF); // red border

      // Fill border: top, bottom, left, right stripes
      let border_thickness = 3;
      let top_rect = RECT { left: 0, top: 0, right: width, bottom: border_thickness };
      let bottom_rect = RECT { left: 0, top: height - border_thickness, right: width, bottom: height };
      let left_rect = RECT { left: 0, top: 0, right: border_thickness, bottom: height };
      let right_rect = RECT { left: width - border_thickness, top: 0, right: width, bottom: height };

      FillRect(hdc, &top_rect, border_brush);
      FillRect(hdc, &bottom_rect, border_brush);
      FillRect(hdc, &left_rect, border_brush);
      FillRect(hdc, &right_rect, border_brush);

      let _ = EndPaint(hwnd, &ps);
      LRESULT(0)
    }
    0x0002 => { // WM_DESTROY
      DefWindowProcW(hwnd, msg, wparam, lparam)
    }
    _ => DefWindowProcW(hwnd, msg, wparam, lparam),
  }
}

fn run_message_loop_for(hwnd: HWND, duration_ms: u32) {
  let start = std::time::Instant::now();
  unsafe {
    loop {
      let mut msg = MSG::default();
      if PeekMessageW(&mut msg, Some(hwnd), 0, 0, PM_REMOVE).as_bool() {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
      }
      if msg.message == 0x0012 { // WM_QUIT
        break;
      }
      if start.elapsed().as_millis() >= duration_ms as u128 {
        break;
      }
      std::thread::sleep(std::time::Duration::from_millis(5));
    }
  }
}

#[napi(js_name = "highlightElement")]
pub async fn highlight_element(
  element_handle: String,
  color: Option<String>,
  duration_ms: Option<i32>,
) -> Result<()> {
  let hwnd = parse_hwnd(&element_handle)?;
  let _color_str = color.unwrap_or_else(|| "#FF0000".to_string());
  let duration = duration_ms.unwrap_or(2000).max(100) as u32;

  let (rect, atom, wide_class) = unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(napi_error("Failed to get window rectangle for highlight"));
    }
    let atom = ensure_window_class();
    if atom == 0 {
      return Err(napi_error("Failed to register highlight window class"));
    }
    let wide_class: Vec<u16> = HIGHLIGHT_CLASS_NAME.encode_utf16().collect();
    (rect, atom, wide_class)
  };

  let width = rect.right - rect.left;
  let height = rect.bottom - rect.top;
  let left = rect.left;
  let top = rect.top;

  let overlay = unsafe {
    let h = CreateWindowExW(
      WINDOW_EX_STYLE(
        WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOPMOST.0 | WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0,
      ),
      PCWSTR(wide_class.as_ptr()),
      PCWSTR::null(),
      WINDOW_STYLE(WS_POPUP.0 | WS_VISIBLE.0),
      left,
      top,
      width,
      height,
      HWND::default(),
      HMENU::default(),
      HINSTANCE::default(),
      None,
    );
    if h.is_invalid() {
      return Err(napi_error("Failed to create highlight overlay window"));
    }
    ShowWindow(h, SW_SHOWNOACTIVATE);
    h
  };

  let (tx, rx) = oneshot::channel::<()>();
  let overlay_for_thread = overlay;

  tokio::task::spawn_blocking(move || {
    run_message_loop_for(overlay_for_thread, duration);
    unsafe {
      let _ = DestroyWindow(overlay_for_thread);
    }
    let _ = tx.send(());
  });

  let _ = rx.await;

  Ok(())
}
