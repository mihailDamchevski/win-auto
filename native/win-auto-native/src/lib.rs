#![deny(unsafe_op_in_unsafe_fn)]

//! # win-auto-native
//!
//! A Windows automation library for Node.js that provides programmatic control of Windows applications
//! through N-API bindings.

mod dialogs;
mod discovery;
mod error;
mod event_watcher;
mod hardware_input;
mod legacy_messages;
mod patterns;
mod highlight;
mod interaction;
#[cfg(feature = "image-ocr")]
mod ocr;
mod ole_drag;
mod process_control;
mod screenshot;
mod template_match;
mod trace;
mod utils;
  