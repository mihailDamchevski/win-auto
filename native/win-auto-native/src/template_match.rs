//! Template matching implementations.
//!
//! When the `image-fft` feature is enabled, provides FFT-based cross-correlation
//! for O(N log N) matching acceleration.
//! Spatial-domain NCC helpers are always available for refinement.

// ── FFT cross-correlation (behind `image-fft` feature) ─────────────────────

#[cfg(feature = "image-fft")]
use rustfft::{FftPlanner, num_complex::Complex};
#[cfg(feature = "image-fft")]
use rustfft::FftDirection;

/// Compute cross-correlation via FFT (O(N log N)).
/// Returns a correlation map of size (sh - th + 1) x (sw - tw + 1).
#[cfg(feature = "image-fft")]
pub fn fft_cross_correlate(
  screen: &[f64],
  sw: usize, sh: usize,
  template: &[f64],
  tw: usize, th: usize,
) -> Vec<f64> {
  let fft_w = (sw + tw - 1).next_power_of_two();
  let fft_h = (sh + th - 1).next_power_of_two();

  let mut screen_buf = vec![Complex::new(0.0f64, 0.0f64); fft_w * fft_h];
  let mut templ_buf = vec![Complex::new(0.0f64, 0.0f64); fft_w * fft_h];

  for y in 0..sh {
    for x in 0..sw {
      screen_buf[y * fft_w + x] = Complex::new(screen[y * sw + x], 0.0);
    }
  }

  for y in 0..th {
    for x in 0..tw {
      templ_buf[y * fft_w + x] = Complex::new(template[(th - 1 - y) * tw + (tw - 1 - x)], 0.0);
    }
  }

  let mut planner = FftPlanner::new();
  fft_2d(&mut screen_buf, fft_w, fft_h, &mut planner, FftDirection::Forward);
  fft_2d(&mut templ_buf, fft_w, fft_h, &mut planner, FftDirection::Forward);

  for i in 0..screen_buf.len() {
    screen_buf[i] = screen_buf[i] * templ_buf[i].conj();
  }

  fft_2d(&mut screen_buf, fft_w, fft_h, &mut planner, FftDirection::Inverse);

  let n = (fft_w * fft_h) as f64;
  let result_w = sw - tw + 1;
  let result_h = sh - th + 1;
  let mut result = Vec::with_capacity(result_w * result_h);
  for y in 0..result_h {
    for x in 0..result_w {
      let val = screen_buf[(y + th - 1) * fft_w + (x + tw - 1)].re / n;
      result.push(val);
    }
  }
  result
}

#[cfg(feature = "image-fft")]
fn fft_2d(
  buffer: &mut [Complex<f64>],
  width: usize, height: usize,
  planner: &mut FftPlanner<f64>,
  direction: FftDirection,
) {
  let fft = planner.plan_fft(width, direction);
  let mut row = vec![Complex::new(0.0f64, 0.0f64); width];
  for y in 0..height {
    let start = y * width;
    row.copy_from_slice(&buffer[start..start + width]);
    fft.process(&mut row);
    buffer[start..start + width].copy_from_slice(&row);
  }

  let fft_col = planner.plan_fft(height, direction);
  let mut col = vec![Complex::new(0.0f64, 0.0f64); height];
  for x in 0..width {
    for y in 0..height {
      col[y] = buffer[y * width + x];
    }
    fft_col.process(&mut col);
    for y in 0..height {
      buffer[y * width + x] = col[y];
    }
  }
}

// ── Spatial NCC helpers (always available, used for refinement) ────────────

/// Normalized Cross-Correlation at a single position.
#[cfg(feature = "image-fft")]
pub fn ncc_at(
  screen: &[f64],
  sw: usize,
  template: &[f64],
  template_mean: f64,
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
      let t_diff = template[ty * tw + tx] - template_mean;
      cross += screen_diff * t_diff;
      window_ss += screen_diff * screen_diff;
    }
  }

  let denominator = (window_ss * template_ss).sqrt();
  if denominator > 0.0 { cross / denominator } else { -1.0 }
}

/// Refine candidates with full-resolution spatial NCC.
#[cfg(feature = "image-fft")]
pub fn refine_candidates(
  screen: &[f64],
  sw: usize,
  template: &[f64],
  tw: usize, th: usize,
  candidates: &[(usize, usize)],
  step: usize,
  max_sx: usize, max_sy: usize,
) -> (usize, usize, f64) {
  let t_len = tw * th;
  let template_mean = template.iter().sum::<f64>() / t_len as f64;
  let template_ss: f64 = template.iter().map(|v| (v - template_mean).powi(2)).sum();
  if template_ss == 0.0 { return (0, 0, -1.0); }

  let mut best_x = 0;
  let mut best_y = 0;
  let mut best_ncc = -1.0f64;

  for &(cx, cy) in candidates {
    let refine_start_x = if cx >= step { cx - step } else { 0 };
    let refine_start_y = if cy >= step { cy - step } else { 0 };
    let refine_end_x = std::cmp::min(cx + step + 1, max_sx);
    let refine_end_y = std::cmp::min(cy + step + 1, max_sy);

    for sy in refine_start_y..refine_end_y {
      for sx in refine_start_x..refine_end_x {
        let ncc = ncc_at(screen, sw, template, template_mean, template_ss, tw, th, sx, sy);
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
