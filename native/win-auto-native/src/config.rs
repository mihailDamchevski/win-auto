use std::path::Path;
use std::sync::Mutex;
use napi_derive::napi;

#[derive(Clone)]
pub struct AppConfig {
  pub executable: String,
  pub class_names: Vec<String>,
}

pub static CONFIG: Mutex<Option<AppConfig>> = Mutex::new(None);

#[napi]
pub fn set_app_config(executable: String, class_names: Vec<String>) {
  *CONFIG.lock().unwrap() = Some(AppConfig { executable, class_names });
}

pub fn get_config() -> Option<AppConfig> {
  CONFIG.lock().unwrap().clone()
}

pub fn configured_executable_image_suffix() -> Option<String> {
  get_config().and_then(|config| {
    Path::new(&config.executable)
      .file_name()
      .map(|name| name.to_string_lossy().to_string().to_ascii_lowercase())
  })
}
