# win-auto

[![npm version](https://img.shields.io/npm/v/win-auto.svg)](https://www.npmjs.com/package/win-auto)
[![npm version](https://img.shields.io/npm/v/win-auto-core.svg)](https://www.npmjs.com/package/win-auto-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Windows desktop automation framework for Node.js and TypeScript

Automate Windows desktop applications with a simple TypeScript/JavaScript API. Launch apps, find UI elements, and simulate user interactions.

## Features

- 🚀 **Simple TypeScript API** - Clean, intuitive interface for desktop automation
- 🔧 **Native Performance** - Rust + napi-rs backend for fast, reliable automation
- 🎯 **Element Finding** - Locate UI elements by role, name, and other attributes
- ⌨️ **User Simulation** - Type text, click buttons, interact with controls
- 📦 **CLI Tool** - Scaffold new automation projects quickly
- 🧪 **Testing Integration** - Built-in support for vitest testing

## Quick Start

### Installation

```bash
npm install win-auto-core
```

For the CLI tool:

```bash
npm install -g win-auto
```

### Basic Usage

```typescript
import { Automation } from "win-auto-core";

// Launch an application
const automation = new Automation();
const app = await automation.launch("C:\\Windows\\System32\\notepad.exe");

// Find an element
const textbox = await app.find({ role: "textbox" });

// Interact with it
await textbox?.type("Hello from win-auto!");
```

### Using the CLI

Create a new automation project:

```bash
win-auto init my-automation-project
cd my-automation-project
npm install
npm run test
```

## API Reference

### Automation

Main entry point for desktop automation.

```typescript
const automation = new Automation();

// Launch an application and get an App instance
const app = await automation.launch(executablePath);

// Or use the lower-level API
const app = await automation.launchApp({ executablePath });
```

### App

Represents a launched application.

```typescript
// Get the main window
const mainWindow = await app.getMainWindow();

// Find elements in the app
const element = await app.find({ role: "button", name: "OK" });
```

### Window

Represents a window in the application.

```typescript
// Find elements within a window
const element = await window.findElement({ role: "textbox" });

// Get window properties
const title = await window.getTitle();
```

### Element

Represents a UI element (button, textbox, etc.).

```typescript
// Interact with elements
await element.typeText("Hello");
await element.click();

// Get element properties
const name = await element.getName();
const role = await element.getRole();
```

## Supported Elements

- TextBox - Type text into input fields
- Button - Click buttons
- ComboBox - Select items from dropdowns
- CheckBox - Toggle checkboxes
- And more standard Windows UI elements

## Examples

### Automating Notepad

```typescript
import { Automation } from "win-auto-core";

async function automateNotepad() {
  const automation = new Automation();

  // Launch Notepad
  const app = await automation.launch("C:\\Windows\\System32\\notepad.exe");

  // Find the text input
  const textbox = await app.find({ role: "textbox" });

  // Type some text
  await textbox?.type("This is an automated message!\n");
  await textbox?.type("win-auto makes it easy!");
}

automateNotepad().catch(console.error);
```

### Finding Elements

```typescript
// Find by role
const button = await app.find({ role: "button" });

// Find by name
const okButton = await app.find({ name: "OK" });

// Find by multiple attributes
const saveButton = await app.find({ role: "button", name: "Save" });
```

### Testing with vitest

```typescript
import { describe, it, expect } from "vitest";
import { Automation } from "win-auto-core/testing";

describe("Notepad Automation", () => {
  it("should type text in notepad", async () => {
    const automation = new Automation();
    const app = await automation.launch("notepad.exe");
    const textbox = await app.find({ role: "textbox" });

    await textbox?.type("Test message");
    expect(textbox).toBeDefined();
  });
});
```

## Requirements

### Runtime

- **Windows 10 / Windows 11** or later
- **Node.js 18+**
- **npm 9+**

### Development

- **Rust toolchain** (if building from source)
  - Install from [https://rustup.rs](https://rustup.rs)

## Packages

This monorepo contains:

- **[win-auto-core](packages/core/)** - TypeScript API and automation engine
- **[win-auto](packages/cli/)** - CLI tool for scaffolding projects
- **[win-auto-native](native/win-auto-native/)** - Native Rust backend (napi-rs)

## Development

### Setup

```bash
git clone https://github.com/mihailDamchevski/win-auto.git
cd win-auto
npm install
```

### Build

```bash
# Build TypeScript packages
npm run build

# Build native addon (requires Rust)
npm run build:native
```

### Testing

```bash
# Unit tests
npm run test

# E2E tests with mock runtime
npm run test:e2e

# Real UI tests (interactive, requires desktop)
REAL_UI_TEST=1 npm run test:e2e:real
```

### Clean

```bash
npm run clean
```

## Troubleshooting

### "Module not found" error

Make sure the native addon is built:

```bash
npm run build:native
```

### Cannot find executable

Use the full path to the application:

```typescript
const app = await automation.launch("C:\\Program Files\\MyApp\\myapp.exe");
```

### Element not found

Try waiting a moment for the UI to render:

```typescript
await new Promise((resolve) => setTimeout(resolve, 500));
const element = await app.find({ role: "button" });
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE) for details

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Note:** This package is optimized for Windows platforms. Cross-platform support for macOS and Linux is not currently planned.

## CLI usage

```powershell
node packages/cli/dist/index.js init demo-project
cd demo-project
npm install
npm test
```
