use napi::{Error, Status};
use thiserror::Error as ThisError;

#[derive(ThisError, Debug)]
pub enum AutomationError {
  #[error("Invalid window/element handle: {handle}")]
  InvalidHandle { handle: String },

  #[error("Element not found: handle={handle}, selector={selector}")]
  ElementNotFound { handle: String, selector: String },

  #[error("Window not found for PID {pid} after {timeout_ms}ms")]
  WindowNotFound { pid: u32, timeout_ms: u64 },

  #[error("COM initialization failed: {reason}")]
  ComInitFailed { reason: String },

  #[error("Access denied: handle={handle}, uip_barrier={is_uip_barrier}")]
  PermissionDenied { handle: String, is_uip_barrier: bool },

  #[error("Elevation required: the target process is running elevated. Use runAs: \"admin\" or run \"win-auto elevate\".")]
  ElevationRequired { pid: u32, operation: String },

  #[error("Pattern not supported: {pattern} on handle={handle}")]
  PatternNotSupported { handle: String, pattern: &'static str },

  #[error("Process launch failed: path={path}, os_error={os_error}")]
  ProcessLaunchFailed { path: String, os_error: i32 },

  #[error("Screenshot failed: handle={handle}, reason={reason}")]
  ScreenshotFailed { handle: String, reason: String },

  #[error("Timeout: {operation} after {duration_ms}ms")]
  Timeout { operation: &'static str, duration_ms: u64 },

  #[error("Dialog operation failed: {message}")]
  DialogFailed { message: String },

  #[error("{message}")]
  Generic { message: String },
}

impl From<AutomationError> for Error {
  fn from(err: AutomationError) -> Self {
    let status = match &err {
      AutomationError::InvalidHandle { .. } => Status::InvalidArg,
      _ => Status::GenericFailure,
    };
    Error::new(status, err.to_string())
  }
}
