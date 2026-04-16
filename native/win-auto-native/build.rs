//! Build script for win-auto-native.
//!
//! Configures the NAPI build environment to properly compile Rust code as a Node.js native module.
//! This script is automatically invoked by cargo during the build process.

fn main() {
  napi_build::setup();
}
