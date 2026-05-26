use napi::{Result};
use napi_derive::napi;
use image::{ImageBuffer, ImageEncoder, Rgba};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{BitBlt, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetWindowDC, ReleaseDC, RGBQUAD, SelectObject, SRCCOPY, DIB_RGB_COLORS};

use crate::error::napi_error;
use crate::utils::parse_hwnd;

struct CapturedBitmap {
  pixels: Vec<u8>,
  width: i32,
  height: i32,
}

fn capture_window_bitmap(hwnd: HWND) -> Result<CapturedBitmap> {
  // SAFETY: GDI handle lifecycle is managed: GetWindowDC/CreateCompatibleDC/CreateCompatibleBitmap
  // resources are released via DeleteObject/DeleteDC/ReleaseDC on all error paths and at the end.
  // The buffer passed to GetDIBits is a valid Vec<u8> with correct size for the bitmap format.
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
      biHeight: -height,
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

    Ok(CapturedBitmap { pixels: buffer, width, height })
  }
}

fn bgra_to_png(bmp: CapturedBitmap) -> Vec<u8> {
  let mut img = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(bmp.width as u32, bmp.height as u32);
  for y in 0..bmp.height {
    for x in 0..bmp.width {
      let idx = ((y * bmp.width + x) * 4) as usize;
      let b = bmp.pixels[idx];
      let g = bmp.pixels[idx + 1];
      let r = bmp.pixels[idx + 2];
      let a = bmp.pixels[idx + 3];
      img.put_pixel(x as u32, y as u32, Rgba([r, g, b, a]));
    }
  }
  let mut png_bytes = Vec::new();
  {
    let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
    encoder
      .write_image(
        img.as_raw(),
        bmp.width as u32,
        bmp.height as u32,
        image::ExtendedColorType::Rgba8,
      )
      .ok();
  }
  png_bytes
}

fn capture_window_bitmap_as_png(hwnd: HWND) -> Result<Vec<u8>> {
  let bmp = capture_window_bitmap(hwnd)?;
  Ok(bgra_to_png(bmp))
}

#[napi(js_name = "captureScreenshot")]
pub async fn capture_screenshot(element_handle: String) -> Result<Vec<u8>> {
  let hwnd = parse_hwnd(&element_handle)?;
  capture_window_bitmap_as_png(hwnd)
}

#[napi(js_name = "captureScreenshotToFile")]
pub async fn capture_screenshot_to_file(element_handle: String, path: String) -> Result<()> {
  let bytes = capture_screenshot(element_handle).await?;
  std::fs::write(path, bytes).map_err(|err| napi_error(format!("Failed to write screenshot file: {err}")))
}

// --- Template matching ---

#[napi(object)]
pub struct ImageMatch {
  pub x: i32,
  pub y: i32,
  pub width: i32,
  pub height: i32,
  pub confidence: f64,
}

fn bgra_to_grayscale(pixels: &[u8], width: usize, height: usize) -> Vec<f64> {
  let mut gray = Vec::with_capacity(width * height);
  for y in 0..height {
    for x in 0..width {
      let idx = (y * width + x) * 4;
      let b = pixels[idx] as f64;
      let g = pixels[idx + 1] as f64;
      let r = pixels[idx + 2] as f64;
      gray.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  gray
}

fn template_match_ncc(
  screen: &[f64],
  sw: usize, sh: usize,
  template: &[f64],
  tw: usize, th: usize,
) -> (usize, usize, f64) {
  let t_len = tw * th;
  let template_mean = template.iter().sum::<f64>() / t_len as f64;
  let template_diff: Vec<f64> = template.iter().map(|v| v - template_mean).collect();
  let template_ss: f64 = template_diff.iter().map(|v| v * v).sum();

  let mut best_x = 0usize;
  let mut best_y = 0usize;
  let mut best_ncc = -1.0f64;

  // Use step=2 for coarse pass, then will be called again for refinement
  let step = 2usize;
  let mut candidates: Vec<(usize, usize, f64)> = Vec::new();

  for sy in (0..=(sh - th)).step_by(step) {
    for sx in (0..=(sw - tw)).step_by(step) {
      let mut window_sum = 0.0f64;
      for ty in 0..th {
        let row_start = ((sy + ty) * sw + sx) as usize;
        let row_end = row_start + tw;
        window_sum += screen[row_start..row_end].iter().sum::<f64>();
      }
      let window_mean = window_sum / t_len as f64;

      let mut cross = 0.0f64;
      let mut window_ss = 0.0f64;
      for ty in 0..th {
        for tx in 0..tw {
          let screen_idx = (sy + ty) * sw + (sx + tx);
          let screen_diff = screen[screen_idx] - window_mean;
          cross += screen_diff * template_diff[ty * tw + tx];
          window_ss += screen_diff * screen_diff;
        }
      }

      let denominator = (window_ss * template_ss).sqrt();
      if denominator > 0.0 {
        let ncc = cross / denominator;
        if ncc > best_ncc {
          best_ncc = ncc;
          best_x = sx;
          best_y = sy;
        }
        if ncc > 0.5 {
          candidates.push((sx, sy, ncc));
        }
      }
    }
  }

  // Refine around top candidates with full resolution
  candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
  for &(cx, cy, _) in candidates.iter().take(5) {
    let refine_start_x = if cx >= step { cx - step } else { 0 };
    let refine_start_y = if cy >= step { cy - step } else { 0 };
    let refine_end_x = std::cmp::min(cx + step + 1, sw - tw + 1);
    let refine_end_y = std::cmp::min(cy + step + 1, sh - th + 1);

    for sy in refine_start_y..refine_end_y {
      for sx in refine_start_x..refine_end_x {
        let mut window_sum = 0.0f64;
        for ty in 0..th {
          let row_start = ((sy + ty) * sw + sx) as usize;
          let row_end = row_start + tw;
          window_sum += screen[row_start..row_end].iter().sum::<f64>();
        }
        let window_mean = window_sum / t_len as f64;

        let mut cross = 0.0f64;
        let mut window_ss = 0.0f64;
        for ty in 0..th {
          for tx in 0..tw {
            let screen_idx = (sy + ty) * sw + (sx + tx);
            let screen_diff = screen[screen_idx] - window_mean;
            cross += screen_diff * template_diff[ty * tw + tx];
            window_ss += screen_diff * screen_diff;
          }
        }

        let denominator = (window_ss * template_ss).sqrt();
        if denominator > 0.0 {
          let ncc = cross / denominator;
          if ncc > best_ncc {
            best_ncc = ncc;
            best_x = sx;
            best_y = sy;
          }
        }
      }
    }
  }

  (best_x, best_y, best_ncc)
}

#[napi(js_name = "findImage")]
pub async fn find_image(element_handle: String, template: Vec<u8>) -> Result<Option<ImageMatch>> {
  let hwnd = parse_hwnd(&element_handle)?;
  let bmp = capture_window_bitmap(hwnd)?;

  let sw = bmp.width as usize;
  let sh = bmp.height as usize;

  // Decode template PNG
  let template_img = image::load_from_memory(&template)
    .map_err(|e| napi_error(format!("Failed to decode template image: {e}")))?;
  let tw = template_img.width() as usize;
  let th = template_img.height() as usize;

  if tw > sw || th > sh {
    return Ok(None);
  }

  let template_rgba = template_img.to_rgba8();
  let template_gray = bgra_to_grayscale(&template_rgba, tw, th);

  // Convert screenshot BGRA to grayscale on a blocking thread
  let screen_pixels = bmp.pixels.clone();
  let screen_gray = tokio::task::spawn_blocking(move || {
    bgra_to_grayscale(&screen_pixels, sw, sh)
  }).await.map_err(|e| napi_error(format!("Thread pool error: {e}")))?;

  // Run template matching on blocking thread
  let (best_x, best_y, best_ncc) = tokio::task::spawn_blocking(move || {
    template_match_ncc(&screen_gray, sw, sh, &template_gray, tw, th)
  }).await.map_err(|e| napi_error(format!("Thread pool error: {e}")))?;

  if best_ncc < 0.3 {
    return Ok(None);
  }

  Ok(Some(ImageMatch {
    x: best_x as i32,
    y: best_y as i32,
    width: tw as i32,
    height: th as i32,
    confidence: best_ncc,
  }))
}
