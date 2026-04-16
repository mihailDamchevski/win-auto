# win-auto skeleton

Initial scaffold for a Windows desktop automation npm package:

- TypeScript API with `Automation`, `App`, `Window`, and `Element`.
- CLI: `win-auto init <project-name>`.
- Rust `napi-rs` native backend with:
  - `launch(executablePath)` -> process ID
  - `enumerateWindows(processId)` -> opaque window handles
  - `findElement(windowHandle, ...)` -> opaque element handle
  - `typeText(elementHandle, text)` -> writes text to the element
- E2E tests for native ping and real Notepad flow.

## Project structure

- `packages/core`: API types, object API wrappers, native loader.
- `packages/cli`: npm CLI package and project initializer.
- `native/win-auto-native`: Rust + napi-rs addon skeleton.
- `tests/e2e`: native integration test.

## Requirements

- Node.js 20+ and npm.
- Rust toolchain for native build:
  - Install from [https://rustup.rs](https://rustup.rs)
  - Verify: `cargo --version`

## Install

```powershell
npm install
```

## Build TypeScript packages

```powershell
npm run build -w @win-auto/core
npm run build -w win-auto
```

## Build native addon

```powershell
npm run build:native
```

## Run tests

```powershell
# API wrapper tests (native calls mocked at unit level)
npm run test -w @win-auto/core

# Native ping integration test (requires successful native build)
npm run test:e2e

# Real Notepad integration test (launch/find/type)
npm run test:e2e:real
```

`test:e2e:real` is opt-in and requires an interactive Windows desktop session.
Set `REAL_UI_TEST=1` before running:

```powershell
$env:REAL_UI_TEST="1"
npm run test:e2e:real
```

## Verify native ping directly

```powershell
node -e "const { Automation } = require('./packages/core/dist'); console.log(new Automation().pingNative())"
```

Expected output:

```text
ok
```

## Real Notepad automation example

Example using the existing object-style API:

```ts
import { Automation } from "../packages/core/src";

const automation = new Automation();
const app = await automation.launch("C:\\Windows\\System32\\notepad.exe");
const element = await app.find({ role: "textbox" });
await element?.type("Hello from win-auto");
```

Equivalent explicit object traversal:

```ts
const app = await automation.launchApp({ executablePath: "C:\\Windows\\System32\\notepad.exe" });
const win = await app.getMainWindow();
const el = await win?.findElement({ role: "textbox" });
await el?.typeText("Hello from win-auto");
```

## CLI usage

```powershell
node packages/cli/dist/index.js init demo-project
cd demo-project
npm install
npm test
```
