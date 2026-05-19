# win-auto-native

Native Rust backend for the win-auto automation framework.

This package contains the platform-specific native addon compiled with napi-rs.
It exposes the low-level automation engine used by the TypeScript wrapper in `win-auto-core`.

## Purpose

- Provide direct Windows automation capabilities
- Build a `.node` binary for the current platform
- Keep native code separated from TypeScript API code

## Installation

This package is not normally installed directly by end users.
The TypeScript package (`win-auto-core`) should load the native addon automatically when available.

If published separately, install with:

```bash
npm install win-auto-native
```

## Build

Requires Rust toolchain and napi-rs CLI.

```bash
npm install
npm run build
```

## Files

- `index.js` - JavaScript loader entry point
- `*.node` - compiled native addon binary
- `README.md` - package documentation
- `LICENSE` - license file

## Usage

The native package is usually consumed indirectly through `win-auto-core`.
The TypeScript wrapper loads the native addon at runtime to perform real Windows automation.

## License

MIT
