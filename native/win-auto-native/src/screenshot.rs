use std::sync::Arc;

use napi::{Error, Result};
use napi_derive::napi;
use image::{ImageBuffer, ImageEncoder, Rgba};
use rayon::prelude::*;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{BitBlt, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetWindowDC, HGDIOBJ, ReleaseDC, RGBQUAD, SelectObject, SRCCOPY, DIB_RGB_COLORS};

use crate::error::AutomationError;
use crate::utils::{parse_hwnd, physical_to_logical};

pub struct CapturedBitmap {
  pub pixels: Vec<u8>,
  pub width: i32,
  pub height: i32,
}

pub fn capture_window_bitmap(hwnd: HWND) -> Result<CapturedBitmap> {
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
      biSizeImage: (width as u32).checked_mul(height as u32).and_then(|v| v.checked_mul(4)).unwrap_or(0),
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    };

    let mut info = BITMAPINFO {
      bmiHeader: header,
      bmiColors: [RGBQUAD::default()],
    };

    let image_size = (width as usize)
      .checked_mul(height as usize)
      .and_then(|v| v.checked_mul(4))
      .ok_or_else(|| napi::Error::from_reason("Screenshot dimensions too large"))?;
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
    if let Err(e) = encoder.write_image(
      img.as_raw(),
      bmp.width as u32,
      bmp.height as u32,
      image::ExtendedColorType::Rgba8,
    ) {
      tracing::warn!("PNG encode failed: {e}");
    }
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
  if path.is_empty() || path.len() > 260 {
    return Err(Error::from(AutomationError::Generic {
      message: format!("Invalid screenshot path length: {}", path.len()),
    }));
  }
  if path.contains('\0') {
    return Err(Error::from(AutomationError::Generic {
      message: "Screenshot path contains null byte".to_string(),
    }));
  }
  let bytes = capture_screenshot(element_handle).await?;
  std::fs::write(&path, bytes).map_err(|err| Error::from(AutomationError::Generic { message: format!("Failed to write screenshot to '{path}': {err}") }))
}

// --- Template matching ---

#[napi(object)]
pub struct ImageMatch {
  pub x: i32,
  pub y: i32,
  pub width: i32,
  pub height: i32,
  pub confidence: f64,
  /// Scale factor at which the match was found (1.0 = original).
  pub scale: f64,
  /// Optional PNG debug overlay with bounding box drawn.
  pub debug_overlay: Option<Vec<u8>>,
}

#[napi(object)]
pub struct FindImageOptions {
  /// Region of interest on the source image: { left, top, width, height }.
  pub roi: Option<RoiRect>,
  /// Minimum confidence threshold (0.0–1.0). Default 0.3.
  pub min_confidence: Option<f64>,
  /// Scales to search (multi-scale pyramid). Default [1.0].
  pub scales: Option<Vec<f64>>,
  /// If true, draw bounding box on the screenshot and return as debug_overlay.
  pub debug: Option<bool>,
}

#[napi(object)]
pub struct RoiRect {
  pub left: i32,
  pub top: i32,
  pub width: i32,
  pub height: i32,
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
  _template: &[f64],
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
      let ncc = ncc_at(screen, sw, _template, template_diff, template_ss, tw, th, sx, sy);
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

/// Template matching entry point: uses FFT when `image-fft` feature is enabled,
/// otherwise falls back to spatial NCC.
fn template_match_ncc(
  screen: &[f64],
  sw: usize, sh: usize,
  template: &[f64],
  tw: usize, th: usize,
) -> (usize, usize, f64) {
  #[cfg(feature = "image-fft")]
  {
    template_match_fft_ncc(screen, sw, sh, template, tw, th)
  }
  #[cfg(not(feature = "image-fft"))]
  {
    template_match_ncc_spatial(screen, sw, sh, template, tw, th)
  }
}

/// FFT-accelerated NCC: uses FFT cross-correlation for coarse scan,
/// then spatial refinement around top candidates.
#[cfg(feature = "image-fft")]
fn template_match_fft_ncc(
  screen: &[f64],
  sw: usize, sh: usize,
  template: &[f64],
  tw: usize, th: usize,
) -> (usize, usize, f64) {
  let t_len = tw * th;
  let template_mean = template.iter().sum::<f64>() / t_len as f64;
  let template_ss: f64 = template.iter().map(|v| (v - template_mean).powi(2)).sum();
  if template_ss == 0.0 { return (0, 0, -1.0); }

  // FFT cross-correlation → full correlation map
  use crate::template_match;
  let corr = template_match::fft_cross_correlate(screen, sw, sh, template, tw, th);

  let result_w = sw - tw + 1;
  let result_h = sh - th + 1;

  // First pass: find global best
  let best_corr = corr.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
  let threshold = best_corr * 0.9;

  // Second pass: collect candidates above threshold (positive correlation only)
  let mut candidates: Vec<(usize, usize, f64)> = Vec::new();
  for y in 0..result_h {
    for x in 0..result_w {
      let val = corr[y * result_w + x];
      if val >= threshold && val > 0.0 {
        candidates.push((x, y, val));
      }
    }
  }

  // Sort by correlation descending, take top 10
  candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
  candidates.truncate(10);

  // Refine top candidates with full NCC via spatial domain
  let refine_candidates: Vec<(usize, usize)> = candidates.iter().map(|&(x, y, _)| (x, y)).collect();
  let (bx, by, bncc) = template_match::refine_candidates(
    screen, sw, template, tw, th, &refine_candidates, 2,
    result_w, result_h,
  );

  (bx, by, bncc)
}

/// Spatial-domain NCC with coarse-to-fine scanning.
fn template_match_ncc_spatial(
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
pub async fn find_image(
  element_handle: String,
  template: Vec<u8>,
  options: Option<FindImageOptions>,
) -> Result<Option<ImageMatch>> {
  let hwnd = parse_hwnd(&element_handle)?;
  let raw_hwnd = hwnd.0 as isize;
  let bmp = capture_window_bitmap(hwnd)?;
  // Store raw isize (Send) instead of HWND (!Send) for use after await
  let _ = hwnd;

  let opts = options.unwrap_or(FindImageOptions {
    roi: None,
    min_confidence: None,
    scales: None,
    debug: None,
  });

  let min_conf = opts.min_confidence.unwrap_or(0.3);
  let scales = opts.scales.unwrap_or(vec![1.0]);
  let do_debug = opts.debug.unwrap_or(false);

  let sw = bmp.width as usize;
  let sh = bmp.height as usize;

  // --- Apply ROI ---
  let (roi_left, roi_top, roi_w, roi_h) = match opts.roi {
    Some(r) => {
      let left = r.left.max(0).min(sw as i32 - 1) as usize;
      let top = r.top.max(0).min(sh as i32 - 1) as usize;
      let w = (r.width as usize).min(sw - left);
      let h = (r.height as usize).min(sh - top);
      if left != r.left as usize || top != r.top as usize || w != r.width as usize || h != r.height as usize {
        tracing::warn!(
          "ROI clipped: requested ({},{},{},{}) → ({},{},{},{}) for {}x{} bitmap",
          r.left, r.top, r.width, r.height, left, top, w, h, sw, sh
        );
      }
      (left, top, w, h)
    }
    None => (0usize, 0usize, sw, sh),
  };

  if roi_w == 0 || roi_h == 0 {
    return Ok(None);
  }

  // Extract ROI pixels
  let roi_pixels: Vec<u8> = if roi_left == 0 && roi_top == 0 && roi_w == sw && roi_h == sh {
    bmp.pixels.clone()
  } else {
    let mut sub = Vec::with_capacity(roi_w * roi_h * 4);
    for y in roi_top..roi_top + roi_h {
      let start = (y * sw + roi_left) * 4;
      let end = start + roi_w * 4;
      sub.extend_from_slice(&bmp.pixels[start..end]);
    }
    sub
  };

  // Decode template PNG
  let template_img = image::load_from_memory(&template)
    .map_err(|e| Error::from(AutomationError::Generic { message: format!("Failed to decode template image: {e}") }))?;
  let tw_orig = template_img.width() as usize;
  let th_orig = template_img.height() as usize;

  if tw_orig > roi_w || th_orig > roi_h {
    return Ok(None);
  }

  let template_rgba = template_img.to_rgba8();

  // --- Multi-scale matching ---
  let mut best_match: Option<(usize, usize, f64, f64, Vec<u8>)> = None;

  // Convert ROI to grayscale once
  let roi_gray = Arc::new(bgra_to_grayscale(&roi_pixels, roi_w, roi_h));

  for &scale in &scales {
    if scale <= 0.0 { continue; }

    let tw = (tw_orig as f64 * scale) as usize;
    let th = (th_orig as f64 * scale) as usize;

    if tw < 4 || th < 4 || tw > roi_w || th > roi_h { continue; }

    // Resize template to this scale
    let scaled_template = if (scale - 1.0).abs() < f64::EPSILON {
      template_rgba.clone()
    } else {
      let resized = image::imageops::resize(
        &template_rgba,
        tw as u32, th as u32,
        image::imageops::FilterType::Lanczos3,
      );
      resized
    };
    let template_gray = bgra_to_grayscale(&scaled_template, tw, th);

    // Run template matching on blocking thread
    let roi_ref = Arc::clone(&roi_gray);
    let (bx, by, bncc) = tokio::task::spawn_blocking(move || {
      template_match_ncc(&roi_ref, roi_w, roi_h, &template_gray, tw, th)
    }).await.map_err(|e| Error::from(AutomationError::Generic { message: format!("Thread pool error: {e}") }))?;

    if bncc >= min_conf {
      let is_better = match &best_match {
        Some((_, _, best_ncc, _, _)) => bncc > *best_ncc,
        None => true,
      };
      if is_better {
        best_match = Some((bx, by, bncc, scale, scaled_template.into_raw()));
      }
    }
  }

  let (best_x, best_y, best_ncc, best_scale, _best_template_raw) = match best_match {
    Some(m) => m,
    None => return Ok(None),
  };

  // Absolute coordinates: add ROI offset and scale back to original coords
  let abs_x_phys = (roi_left as f64 + best_x as f64 / best_scale) as i32;
  let abs_y_phys = (roi_top as f64 + best_y as f64 / best_scale) as i32;
  let match_w_phys = (tw_orig as f64 * best_scale) as i32;
  let match_h_phys = (th_orig as f64 * best_scale) as i32;

  // Convert from physical (screen/GDI) pixels to logical (DIP) pixels
  let hwnd = HWND(raw_hwnd as *mut core::ffi::c_void);
  let abs_x = physical_to_logical(hwnd, abs_x_phys);
  let abs_y = physical_to_logical(hwnd, abs_y_phys);
  let match_w = physical_to_logical(hwnd, match_w_phys);
  let match_h = physical_to_logical(hwnd, match_h_phys);

  // --- Debug overlay ---
  let debug_overlay: Option<Vec<u8>> = if do_debug {
    let mut img = ImageBuffer::<Rgba<u8>, _>::from_raw(
      bmp.width as u32,
      bmp.height as u32,
      bmp.pixels.clone(),
    );
    if let Some(ref mut draw_img) = img {
      let rect_color = image::Rgba([255u8, 0u8, 0u8, 200u8]);
      // Draw bounding box (simple: top/bottom/left/right lines) using physical coords
      let x1 = abs_x_phys.max(0) as u32;
      let y1 = abs_y_phys.max(0) as u32;
      let x2 = (abs_x_phys + match_w_phys).min(sw as i32 - 1).max(0) as u32;
      let y2 = (abs_y_phys + match_h_phys).min(sh as i32 - 1).max(0) as u32;
      for x in x1..=x2 {
        if y1 < draw_img.height() { draw_img.put_pixel(x, y1, rect_color); }
        if y2 < draw_img.height() { draw_img.put_pixel(x, y2, rect_color); }
      }
      for y in y1..=y2 {
        if x1 < draw_img.width() { draw_img.put_pixel(x1, y, rect_color); }
        if x2 < draw_img.width() { draw_img.put_pixel(x2, y, rect_color); }
      }
      // Encode as PNG
      let mut png_bytes = Vec::new();
      let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
      if let Err(e) = encoder.write_image(
        draw_img.as_raw(),
        draw_img.width(),
        draw_img.height(),
        image::ExtendedColorType::Rgba8,
      ) {
        tracing::warn!("PNG encode failed for debug overlay: {e}");
      }
      Some(png_bytes)
    } else {
      None
    }
  } else {
    None
  };

  Ok(Some(ImageMatch {
    x: abs_x,
    y: abs_y,
    width: match_w,
    height: match_h,
    confidence: best_ncc,
    scale: best_scale,
    debug_overlay,
  }))
}
