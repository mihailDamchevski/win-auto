use napi::{Error, Result};
use napi_derive::napi;
use image::{ImageBuffer, ImageEncoder, Rgba};
use rayon::prelude::*;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{BitBlt, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetWindowDC, HGDIOBJ, ReleaseDC, RGBQUAD, SelectObject, SRCCOPY, DIB_RGB_COLORS};

use crate::error::AutomationError;
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
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to get window rectangle".into() }));
    }

    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;

    if width <= 0 || height <= 0 {
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Invalid window bounds for screenshot".into() }));
    }

    let hdc_window = GetWindowDC(Some(hwnd));
    if hdc_window.is_invalid() {
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to get window device context".into() }));
    }

    let hdc_mem = CreateCompatibleDC(Some(hdc_window));
    if hdc_mem.is_invalid() {
      ReleaseDC(Some(hwnd), hdc_window);
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to create compatible DC".into() }));
    }

    let hbitmap = CreateCompatibleBitmap(hdc_window, width, height);
    if hbitmap.is_invalid() {
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(Some(hwnd), hdc_window);
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to create compatible bitmap".into() }));
    }

    let old_obj = SelectObject(hdc_mem, HGDIOBJ::from(hbitmap));
    if old_obj.is_invalid() {
      let _ = DeleteObject(HGDIOBJ::from(hbitmap));
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(Some(hwnd), hdc_window);
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to select bitmap into DC".into() }));
    }

    if BitBlt(hdc_mem, 0, 0, width, height, Some(hdc_window), 0, 0, SRCCOPY).is_err() {
      let _ = SelectObject(hdc_mem, old_obj);
      let _ = DeleteObject(HGDIOBJ::from(hbitmap));
      let _ = DeleteDC(hdc_mem);
      let _ = ReleaseDC(Some(hwnd), hdc_window);
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to capture window bitmap".into() }));
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
    let _ = DeleteObject(HGDIOBJ::from(hbitmap));
    let _ = DeleteDC(hdc_mem);
    let _ = ReleaseDC(Some(hwnd), hdc_window);

    if result == 0 {
      return Err(Error::from(AutomationError::ScreenshotFailed { handle: format!("{}", hwnd.0 as isize), reason: "Failed to read bitmap pixels".into() }));
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
  std::fs::write(path, bytes).map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to write screenshot file: {err}") }))
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

/// Compute NCC for a single position (sx, sy).
fn ncc_at(
  screen: &[f64],
  sw: usize,
  template: &[f64],
  template_diff: &[f64],
  template_ss: f64,
  tw: usize, th: usize,
  sx: usize, sy: usize,
) -> f64 {
  let t_len = tw * th;
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
  if denominator > 0.0 { cross / denominator } else { -1.0 }
}

/// Search a sub-region of the screen at step resolution, returning the top match and any
/// candidates above 0.5 for later refinement.
fn search_region_coarse(
  screen: &[f64],
  sw: usize,
  _template: &[f64],
  template_diff: &[f64],
  template_ss: f64,
  tw: usize, th: usize,
  start_x: usize, start_y: usize,
  end_x: usize, end_y: usize,
  step: usize,
) -> (usize, usize, f64, Vec<(usize, usize, f64)>) {
  let mut best_x = start_x;
  let mut best_y = start_y;
  let mut best_ncc = -1.0f64;
  let mut candidates = Vec::new();

  let mut sy = start_y;
  while sy < end_y {
    let mut sx = start_x;
    while sx < end_x {
      let ncc = ncc_at(screen, sw, template, template_diff, template_ss, tw, th, sx, sy);
      if ncc > best_ncc {
        best_ncc = ncc;
        best_x = sx;
        best_y = sy;
      }
      if ncc > 0.5 {
        candidates.push((sx, sy, ncc));
      }
      sx += step;
    }
    sy += step;
  }

  (best_x, best_y, best_ncc, candidates)
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

  let step = 2usize;
  let max_sx = sw.saturating_sub(tw) + 1;
  let max_sy = sh.saturating_sub(th) + 1;

  // Split into 4 quadrants and search in parallel with rayon.
  let mid_x = max_sx / 2;
  let mid_y = max_sy / 2;
  let quadrants = vec![
    (0usize, 0usize, mid_x, mid_y),                                  // top-left
    (mid_x, 0usize, max_sx, mid_y),                                   // top-right
    (0usize, mid_y, mid_x, max_sy),                                   // bottom-left
    (mid_x, mid_y, max_sx, max_sy),                                   // bottom-right
  ];

  let mut results: Vec<(usize, usize, f64, Vec<(usize, usize, f64)>)> = quadrants
    .par_iter()
    .map(|&(sx, sy, ex, ey)| {
      search_region_coarse(
        screen, sw, template, &template_diff, template_ss,
        tw, th, sx, sy, ex, ey, step,
      )
    })
    .collect();

  // Merge: pick the best across quadrants, collect all candidates.
  let mut best_x = 0usize;
  let mut best_y = 0usize;
  let mut best_ncc = -1.0f64;
  let mut all_candidates = Vec::new();

  for (bx, by, bncc, cands) in results.iter_mut() {
    if *bncc > best_ncc {
      best_ncc = *bncc;
      best_x = *bx;
      best_y = *by;
    }
    all_candidates.append(cands);
  }

  // Refine around top candidates with full resolution
  all_candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
  for &(cx, cy, _) in all_candidates.iter().take(5) {
    let refine_start_x = if cx >= step { cx - step } else { 0 };
    let refine_start_y = if cy >= step { cy - step } else { 0 };
    let refine_end_x = std::cmp::min(cx + step + 1, max_sx);
    let refine_end_y = std::cmp::min(cy + step + 1, max_sy);

    for sy in refine_start_y..refine_end_y {
      for sx in refine_start_x..refine_end_x {
        let ncc = ncc_at(screen, sw, template, &template_diff, template_ss, tw, th, sx, sy);
        if ncc > best_ncc {
          best_ncc = ncc;
          best_x = sx;
          best_y = sy;
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
    .map_err(|e| Error::from(AutomationError::Generic { message: format!("Failed to decode template image: {e}") }))?;
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
  }).await.map_err(|e| Error::from(AutomationError::Generic { message: format!("Thread pool error: {e}") }))?;

  // Run template matching on blocking thread
  let (best_x, best_y, best_ncc) = tokio::task::spawn_blocking(move || {
    template_match_ncc(&screen_gray, sw, sh, &template_gray, tw, th)
  }).await.map_err(|e| Error::from(AutomationError::Generic { message: format!("Thread pool error: {e}") }))?;

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
