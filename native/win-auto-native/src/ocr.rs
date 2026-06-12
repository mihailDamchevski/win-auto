//! OCR module using Windows.Media.Ocr (Windows 10+).
//!
//! Gated behind the `image-ocr` Cargo feature.

use napi::{Error, Result};
use napi_derive::napi;

use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;

use crate::error::AutomationError;
use crate::utils::parse_hwnd;

#[napi(object)]
pub struct OcrResult {
  pub text: String,
  pub lines: Vec<OcrLine>,
}

#[napi(object)]
pub struct OcrLine {
  pub text: String,
  pub left: i32,
  pub top: i32,
  pub width: i32,
  pub height: i32,
}

#[napi(object)]
pub struct FindTextOptions {
  pub language: Option<String>,
}

fn capture_window_bgra(element_handle: &str) -> Result<(Vec<u8>, i32, i32)> {
  let hwnd = parse_hwnd(element_handle)?;
  let bmp = super::screenshot::capture_window_bitmap(hwnd)?;
  Ok((bmp.pixels, bmp.width, bmp.height))
}

#[napi(js_name = "findText")]
pub async fn find_text(element_handle: String, options: Option<FindTextOptions>) -> Result<Option<OcrResult>> {
  let (pixels, width, height) = capture_window_bgra(&element_handle)?;

  if width <= 0 || height <= 0 {
    return Ok(None);
  }

  // Non-Send WinRT types (SoftwareBitmap, OcrEngine) are scoped to this block
  // and dropped before the await point. IAsyncOperation<OcrResult> IS Send,
  // so the future at the await point can cross the Send boundary safely.
  let ocr_future = {
    let writer = DataWriter::new()
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to create DataWriter: {e}") }))?;

    writer.WriteBytes(&pixels)
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to write pixel data: {e}") }))?;

    let buffer = writer.DetachBuffer()
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to detach buffer: {e}") }))?;

    let bgra_bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width, height)
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to create SoftwareBitmap: {e}") }))?;

    let gray_bitmap = SoftwareBitmap::Convert(&bgra_bitmap, BitmapPixelFormat::Gray8)
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to convert to Gray8: {e}") }))?;

    let engine = match options.and_then(|o| o.language) {
      Some(ref lang_code) => {
        let lang = Language::CreateLanguage(&windows::core::HSTRING::from(lang_code.as_str()))
          .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to create language '{lang_code}': {e}") }))?;
        OcrEngine::TryCreateFromLanguage(&lang)
          .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("OcrEngine creation failed: {e}") }))?
      }
      None => OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("OcrEngine creation failed: {e}") }))?,
    };

    // Transfer ownership of gray_bitmap into the async call, drop engine after
    engine.RecognizeAsync(&gray_bitmap)
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to start recognition: {e}") }))?
  };
  // gray_bitmap, engine, writer, bgra_bitmap, buffer are all dropped here

  // IAsyncOperation<OcrResult> is Send — safe to await
  let ocr_result = ocr_future.await
    .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Recognition failed: {e}") }))?;

  let text = ocr_result.Text()
    .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get text: {e}") }))?;

  let lines = ocr_result.Lines()
    .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get lines: {e}") }))?;

  let count = lines.Size()
    .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get line count: {e}") }))? as u32;

  let mut result_lines = Vec::with_capacity(count as usize);

  for i in 0..count {
    let line = lines.GetAt(i)
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get line {i}: {e}") }))?;
    let line_text = line.Text()
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get line text: {e}") }))?;

    let words = line.Words()
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get words: {e}") }))?;
    let word_count = words.Size()
      .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get word count: {e}") }))? as u32;

    if word_count == 0 {
      result_lines.push(OcrLine { text: line_text.to_string(), left: 0, top: 0, width: 0, height: 0 });
      continue;
    }

    let mut min_left = i32::MAX;
    let mut min_top = i32::MAX;
    let mut max_right = i32::MIN;
    let mut max_bottom = i32::MIN;

    for j in 0..word_count {
      let word = words.GetAt(j)
        .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get word {j}: {e}") }))?;
      let bounds = word.BoundingRect()
        .map_err(|e| Error::from(AutomationError::OcrFailed { message: format!("Failed to get word bounds: {e}") }))?;

      let l = bounds.X as i32;
      let t = bounds.Y as i32;
      let r = (bounds.X + bounds.Width) as i32;
      let b = (bounds.Y + bounds.Height) as i32;
      if l < min_left { min_left = l; }
      if t < min_top { min_top = t; }
      if r > max_right { max_right = r; }
      if b > max_bottom { max_bottom = b; }
    }

    let w = max_right - min_left;
    let h = max_bottom - min_top;
    result_lines.push(OcrLine {
      text: line_text.to_string(),
      left: if min_left == i32::MAX { 0 } else { min_left },
      top: if min_top == i32::MAX { 0 } else { min_top },
      width: if w < 0 { 0 } else { w },
      height: if h < 0 { 0 } else { h },
    });
  }

  Ok(Some(OcrResult { text: text.to_string(), lines: result_lines }))
}
