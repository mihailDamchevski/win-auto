use napi_derive::napi;

#[napi]
pub fn set_app_config(_executable: String, _class_names: Vec<String>) {
  // Deprecated: config is now managed per-call from TypeScript side.
  // Kept for backward compatibility — no-op.
}
