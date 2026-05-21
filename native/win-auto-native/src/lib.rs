//! # win-auto-native
//!
//! A Windows automation library for Node.js that provides programmatic control of Windows applications
//! through N-API bindings. This crate has been refactored into focused modules for configuration,
//! discovery, process control, input interaction, and screenshot capture.

mod error;
mod config;
mod utils;
mod discovery;
mod process_control;
mod interaction;
mod screenshot;
