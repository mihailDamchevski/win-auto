use std::sync::OnceLock;
use tracing_subscriber::EnvFilter;

static INIT: OnceLock<bool> = OnceLock::new();

/// Call once at startup to enable structured tracing.
///
/// Controlled by `WIN_AUTO_TRACE` environment variable:
/// - `WIN_AUTO_TRACE=1` or `WIN_AUTO_TRACE=true` → enable at `info` level
/// - `WIN_AUTO_TRACE=debug` → enable at `debug` level
/// - `WIN_AUTO_TRACE=trace` → enable at `trace` level
/// - `WIN_AUTO_TRACE=off` or unset → disabled (default)
///
/// Safe to call multiple times; only the first call has an effect.
pub fn init_tracing() {
  INIT.get_or_init(|| {
    let val = std::env::var("WIN_AUTO_TRACE").unwrap_or_default();
    if val.is_empty() || val == "off" || val == "0" || val == "false" {
      return false;
    }
    let filter = match val.to_ascii_lowercase().as_str() {
      "debug" => EnvFilter::new("win_auto_native=debug"),
      "trace" => EnvFilter::new("win_auto_native=trace"),
      _ => EnvFilter::new("win_auto_native=info"),
    };
    tracing_subscriber::fmt().with_env_filter(filter).with_target(true).init();
    true
  });
}
