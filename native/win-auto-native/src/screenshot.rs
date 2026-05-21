use napi::{Result};
use napi_derive::napi;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{BitBlt, BI_RGB, BITMAPFILEHEADER, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetWindowDC, ReleaseDC, RGBQUAD, SelectObject, SRCCOPY, DIB_RGB_COLORS};

use crate::error::napi_error;
use crate::utils::parse_hwnd;

fn capture_window_bitmap(hwnd: HWND) -> Result<Vec<u8>> {
  unsafe {
    let mut rect = RECT::default();
    if windows::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut rect).is_err() {
      return Err(napi_error("Failed to get window rectangle"));
    }

    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;

    if width <= 0 || height <= 0 {
      return Err(napi_error("Invalid window bounds for screenshot"));
    }

    let hdc_window = GetWindowDC(hwnd);
    if hdc_window.is_invalid() {
      return Err(napi_error("Failed to get window device context"));
    }

    let hdc_mem = CreateCompatibleDC(hdc_window);
    if hdc_mem.is_invalid() {
      ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to create compatible DC"));
    }

    let hbitmap = CreateCompatibleBitmap(hdc_window, width, height);
    if hbitmap.is_invalid() {
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to create compatible bitmap"));
    }

    let old_obj = SelectObject(hdc_mem, hbitmap);
    if old_obj.is_invalid() {
      let _ = DeleteObject(hbitmap);
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to select bitmap into DC"));
    }

    if BitBlt(hdc_mem, 0, 0, width, height, hdc_window, 0, 0, SRCCOPY).is_err() {
      let _ = SelectObject(hdc_mem, old_obj);
      let _ = DeleteObject(hbitmap);
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(hwnd, hdc_window);
      return Err(napi_error("Failed to capture window bitmap"));
    }

    let header = BITMAPINFOHEADER {
      biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
      biWidth: width,
      biHeight: height,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: BI_RGB.0,
      biSizeImage: (width * height * 4) as u32,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    };

    let mut info = BITMAPINFO {
      bmiHeader: header,
      bmiColors: [RGBQUAD::default()],
    };

    let image_size = (width * height * 4) as usize;
    let mut buffer = vec![0u8; image_size];

    let result = GetDIBits(
      hdc_mem,
      hbitmap,
      0,
      height as u32,
      Some(buffer.as_mut_ptr() as *mut _),
      &mut info,
      DIB_RGB_COLORS,
    );

    let _ = SelectObject(hdc_mem, old_obj);
    let _ = DeleteObject(hbitmap);
    let _ = DeleteDC(hdc_mem);
    let _ = ReleaseDC(hwnd, hdc_window);

    if result == 0 {
      return Err(napi_error("Failed to read bitmap pixels"));
    }

    let file_header = BITMAPFILEHEADER {
      bfType: 0x4D42,
      bfSize: (std::mem::size_of::<BITMAPFILEHEADER>() + std::mem::size_of::<BITMAPINFOHEADER>() + image_size) as u32,
      bfReserved1: 0,
      bfReserved2: 0,
      bfOffBits: (std::mem::size_of::<BITMAPFILEHEADER>() + std::mem::size_of::<BITMAPINFOHEADER>()) as u32,
    };

    let mut output = Vec::with_capacity(file_header.bfSize as usize);
    output.extend_from_slice(std::slice::from_raw_parts(
      (&file_header as *const BITMAPFILEHEADER) as *const u8,
      std::mem::size_of::<BITMAPFILEHEADER>(),
    ));
    output.extend_from_slice(std::slice::from_raw_parts(
      (&header as *const BITMAPINFOHEADER) as *const u8,
      std::mem::size_of::<BITMAPINFOHEADER>(),
    ));
    output.extend_from_slice(&buffer);

    Ok(output)
  }
}

#[napi(js_name = "captureScreenshot")]
pub async fn capture_screenshot(element_handle: String) -> Result<Vec<u8>> {
  let hwnd = parse_hwnd(&element_handle)?;
  capture_window_bitmap(hwnd)
}

#[napi(js_name = "captureScreenshotToFile")]
pub async fn capture_screenshot_to_file(element_handle: String, path: String) -> Result<()> {
  let bytes = capture_screenshot(element_handle).await?;
  std::fs::write(path, bytes).map_err(|err| napi_error(format!("Failed to write screenshot file: {err}")))
}
