# win-auto

[![npm version](https://img.shields.io/npm/v/win-auto.svg)](https://www.npmjs.com/package/win-auto)
[![npm version](https://img.shields.io/npm/v/win-auto-core.svg)](https://www.npmjs.com/package/win-auto-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Windows desktop automation framework for Node.js and TypeScript

Automate Windows desktop applications with a simple TypeScript/JavaScript API. Launch apps, find UI elements, and simulate user interactions.

## Features

- 🚀 **Simple TypeScript API** - Clean, intuitive interface for desktop automation
- 🔧 **Native Performance** - Rust + napi-rs backend for fast, reliable automation
- 🎯 **Element Finding** - Locate UI elements by role, name, automation ID, and other attributes
- 🏷️ **Element Attributes** - Read arbitrary UIA properties (name, role, value, bounds, isEnabled, and many more)
- ⌨️ **Modifier Key Hold/Release** - `keyDown("Ctrl")` / `keyUp("Ctrl")` for complex multi-key sequences
- ✂️ **Text Selection** - Select all text, get current selection, and replace selected text
- 🔭 **UI Tree Inspection** - Recursively walk the UIA element tree of any window (great for debugging)
- 🖥️ **CLI Inspector** - `win-auto inspect <pid|imageName>` — browse the UI tree of any running app
- ⌨️ **User Simulation** - Type text, click buttons, interact with controls, send keyboard shortcuts
- 🪟 **Window Management** - Maximize, minimize, restore, resize, and move windows
- 🖱️ **Mouse Operations** - Click, right-click, double-click, hover, scroll, and drag-drop on elements
- 🗔 **Dialog Handling** - Detect and interact with modal dialogs (file open, message boxes, etc.)
- 🔍 **Process Management** - Find running processes, connect to them, wait for exit, kill
- 📸 **Screenshots** - Capture window and element screenshots to buffer or file (BMP format)
- 📡 **Event System** - Subscribe to automation events (app launched, element clicked, etc.) for logging and debugging
- 📦 **CLI Tool** - Scaffold new automation projects quickly
- 🧪 **Testing Integration** - Built-in support for vitest with auto-cleanup via TestAutomation
- 🧪 **Assertion Helpers** - `expectElement(el).toBeVisible()`, `.toBeEnabled()`, `.toHaveText()`, and more
- 🧪 **Conditional Runners** - `it.ci()` / `it.realDesktop()` for environment-aware test suites
- 🧪 **Time Measurement** - `measureTime()` / `measureAsync()` for performance assertions
- 🎭 **Mock Backend** - Test automation logic without a real Windows desktop

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

Inspect the UI tree of any running application:

```bash
win-auto inspect 1234       # by PID
win-auto inspect notepad    # by image name
win-auto inspect 1234 10    # with custom max depth
```
```

## API Reference

### Automation

```typescript
const automation = new Automation();

// Launch an application
const app = await automation.launch(executablePath);

// Or connect to an already-running app
const app = automation.connectApp({ processId: 1234 });

// Use a mock backend for testing
const automation = new Automation(new MockBackend());

// Move the mouse cursor to absolute screen coordinates
await automation.mouseMove(500, 300);

// Subscribe to events
automation.events.on("app:launched", (data) => console.log("App launched:", data));
automation.events.on("element:clicked", (data) => console.log("Clicked:", data.handle));
automation.events.on("debug", (data) => console.debug("[auto]", data.message));
```

### App

Represents a launched application.

```typescript
// Get the main window
const mainWindow = await app.getMainWindow();

// List all windows
const windows = await app.listWindows();

// Find elements throughout the app
const element = await app.find({ role: "button", name: "OK" });

// Wait for elements via the app's main window
const btn = await app.waitForElement({ name: "OK" }, { timeoutMs: 5000 });
const visible = await app.waitForVisible({ name: "OK" });
const enabled = await app.waitForEnabled({ name: "OK" });

// Close the app with optional wait
await app.close({ timeoutMs: 5000 });
```

### Window

Represents a window in the application.

```typescript
// Find a single element
const element = await window.findElement({ role: "textbox" });
const el = await window.find({ name: "OK" });

// Find all matching elements
const allButtons = await window.findAll({ role: "button" });

// Click elements by name or in sequence
await window.clickElementByName("Save");
await window.clickSequence(["File", "Save As"]);

// Type text directly into a window
await window.typeText("Hello");

// Window management
const bounds = await window.getBounds();
await window.setBounds({ left: 0, top: 0, width: 800, height: 600 });
await window.maximize();
await window.minimize();
await window.restore();

// Keyboard input
await window.pressKey("Ctrl+S");

// Hold/release modifier keys for complex sequences
await window.keyDown("Ctrl");
await window.pressKey("A");   // select all while Ctrl is held
await window.keyUp("Ctrl");

// Inspect UI tree (sync, returns structured element tree)
const tree = window.inspectTree(5); // max depth
for (const node of tree) {
  console.log(node.name, node.role, node.automationId);
}

// Screenshots
const pixels = await window.screenshot();       // BMP byte array
await window.screenshotToFile("window.bmp");    // save to file

// Wait for elements to appear or reach a state
const btn = await window.waitForElement({ name: "OK" }, { timeoutMs: 5000 });
const visibleBtn = await window.waitForVisible({ name: "OK" });
const enabledBtn = await window.waitForEnabled({ name: "OK" });

// Close the window
await window.close();
```

### Element

Represents a UI element (button, textbox, etc.).

```typescript
// Interact with elements
await element.typeText("Hello");
await element.click();
await element.rightClick();
await element.doubleClick();
await element.hover();
await element.scroll("down", 3);       // scroll 3 steps down
await element.dragDrop(targetElement); // drag onto another element
await element.select();
await element.toggle();

// Get/set value
const value = await element.getValue();
await element.setValue("new value");
const text = await element.getText();

// Element state
const visible = await element.isVisible();
const enabled = await element.isEnabled();
const focused = await element.isFocused();
const toggleState = await element.getToggleState();

// Read arbitrary UIA attributes
const name = await element.getAttribute("name");
const role = await element.getAttribute("role");
const bounds = await element.getAttribute("bounds");
const isPassword = await element.getAttribute("isPassword");
// getProperty is an alias for getAttribute
const autoId = await element.getProperty("automationId");

// Wait for element state
await element.waitForVisible({ timeoutMs: 5000 });
await element.waitForEnabled();

// Tree navigation
const parent = await element.getParent();
const children = await element.getChildren();
const siblings = await element.getSiblings();

// Text selection operations
await element.selectText();                              // select all text
const selected = await element.getSelection();            // get selected text
await element.replaceSelectedText("replacement");          // replace selection

// Keyboard modifier hold/release (via the element's parent window)
await element.keyDown("Shift");
await element.keyDown("Ctrl");
await element.pressKey("End");  // Ctrl+Shift+End — select to end
await element.keyUp("Shift");
await element.keyUp("Ctrl");

// Screenshots
const pixels = await element.screenshot();          // BMP byte array
await element.screenshotToFile("element.bmp");      // save to file
```

### UI Tree Inspection

Every `Window` instance has an `inspectTree` method that recursively walks the UIA element tree — useful for debugging, exploration, and writing selectors.

```typescript
const window = await app.getMainWindow();
const tree = window.inspectTree(5); // max depth (default 10)

// Recursively walk the tree
function print(node, indent = 0) {
  console.log("  ".repeat(indent) + `${node.handle} ${node.name} [${node.role}]`);
  for (const child of node.children) print(child, indent + 1);
}
for (const node of tree) print(node);
```

The CLI provides the same functionality:

```bash
win-auto inspect notepad.exe
# Process: notepad.exe (PID: 1234)
#   Window: 0x1A0B4
#     Bounds: 0,0 1200x800
#     0x1A2C0  | text
#     0x1A2D0  Edit | document
#     0x1A2E0  Status Bar | status bar
```

### Text Selection

`Element` supports text selection operations for editable text controls:

```typescript
// Select all text in the element
await element.selectText();

// Get the currently selected text
const selection = await element.getSelection();
console.log("Selected:", selection);

// Replace selected text with new content
await element.replaceSelectedText("new content");
// This selects all text first, then replaces it
```

### Keyboard Modifier Hold/Release

For complex keyboard sequences that require holding modifier keys across multiple operations:

```typescript
// Select text from cursor to end of line
await element.keyDown("Shift");
await element.pressKey("End");
await element.keyUp("Shift");

// Ctrl+A to select all
await window.keyDown("Ctrl");
await window.pressKey("A");
await window.keyUp("Ctrl");

// Complex sequence: Ctrl+Shift+End
await window.keyDown("Ctrl");
await window.keyDown("Shift");
await window.pressKey("End");
await window.keyUp("Ctrl");
await window.keyUp("Shift");
```

### Backend

The automation engine uses a pluggable backend:

- **`NativeBackend`** (default) - Real Windows automation via Rust/napi-rs
- **`MockBackend`** - In-memory simulation for unit tests without a desktop

```typescript
import { Automation, MockBackend } from "@win-auto/core";

// Use mock backend for testing
const automation = new Automation(new MockBackend());
const app = await automation.launch("notepad.exe");
const el = await app.find({ role: "textbox" });
await el?.typeText("test");
console.log(await el?.getText()); // "test"
```

### Process Management

Every `Automation` instance has a `processes` manager for finding and inspecting running processes.

```typescript
// Find running processes by image name
const notepads = automation.processes.findByName("notepad.exe");
for (const proc of notepads) {
  console.log(`PID ${proc.pid}: ${proc.imageName}`);
  const path = await proc.getImagePath(backend);
  const running = await proc.isRunning(backend);
}

// Connect to an already-running application
const app = await automation.connectProcess("notepad.exe");
if (app) {
  const window = await app.getMainWindow();
  // interact with it...
}

// Each App has lifecycle management
await app.waitForExit(5000);   // wait up to 5s for process to exit
const running = await app.isRunning();
await app.kill();              // force terminate
```

### Dialog

Every `App` instance has a `dialogs` property for detecting and interacting with modal dialog boxes.

```typescript
// List all open dialogs for the app
const dialogs = app.dialogs.list();

// Find a specific dialog by title
const dialog = app.dialogs.find("Save As");

// Wait for a dialog to appear (with timeout)
const dialog = await app.dialogs.waitFor({
  title: "Open",
  timeoutMs: 5000,
});

// Interact with the dialog
await dialog.clickButton("OK");        // click a button by its text
await dialog.accept();                 // click "OK"
await dialog.dismiss();                // click "Cancel"

// For file dialogs, type a path and accept
await dialog.selectFile("C:\\path\\file.txt");
await dialog.accept();

// Inspect dialog controls
const controls = await dialog.getControls();
for (const ctrl of controls) {
  console.log(ctrl.name, ctrl.control_type);
}
```

### Events

Every `Automation` instance has an `events` property (an EventEmitter) that emits structured events for all operations:

```typescript
const automation = new Automation();

// Log all events
automation.events.on("debug", (data) => console.log("[auto]", data.message));

// Track specific events
automation.events.on("app:launched", (data) => {
  console.log(`App ${data.executablePath} started (PID: ${data.processId})`);
});

automation.events.on("element:clicked", (data) => {
  console.log(`Element ${data.handle} was clicked`);
});

automation.events.on("element:typed", (data) => {
  console.log(`Typed "${data.text}" into element ${data.handle}`);
});

// Window management events
automation.events.on("window:maximized", (data) => {
  console.log(`Window ${data.handle} maximized`);
});

automation.events.on("window:closed", (data) => {
  console.log(`Window ${data.handle} closed`);
});
```

Full list of event types: `app:launched`, `app:closed`, `window:found`, `window:closed`, `window:boundsChanged`, `window:maximized`, `window:minimized`, `window:restored`, `element:found`, `element:clicked`, `element:rightClicked`, `element:doubleClicked`, `element:hovered`, `element:typed`, `element:selected`, `element:toggled`, `element:valueChanged`, `element:screenshot`, `dialog:found`, `dialog:buttonClicked`, `dialog:fileSelected`, `process:connected`, `process:killed`, `process:exited`, `mouse:moved`, `debug`.

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
import { describe, it, expect, afterAll } from "vitest";
import { Automation } from "@win-auto/core";
import { TestAutomation, closeTrackedApps } from "@win-auto/core";
// Or using the testing subpath:
// import { TestAutomation, closeTrackedApps } from "@win-auto/core/testing";

describe("Notepad Automation", () => {
  afterAll(async () => {
    await closeTrackedApps();
  });

  it("should type text in notepad", async () => {
    // TestAutomation automatically tracks launched apps for cleanup
    const automation = new TestAutomation();
    const app = await automation.launch("notepad.exe");
    const textbox = await app.find({ role: "textbox" });

    await textbox?.type("Test message");
    expect(textbox).toBeDefined();
  });
});

// Or use the MockBackend to test without real Windows:
import { MockBackend } from "@win-auto/core";

it("works without a real desktop", async () => {
  const automation = new Automation(new MockBackend());
  const app = await automation.launch("notepad.exe");
  const el = await app.find({ role: "textbox" });
  await el?.type("Hello");
  expect(await el?.getText()).toBe("Hello");
});

// Advanced testing with assertion helpers, conditional runners, and mock factories:
// import { expectElement, expectScreenshot, it, createMockElement } from "@win-auto/core/testing";

it("uses assertion helpers", async () => {
  const auto = new Automation(new MockBackend());
  const app = await auto.launch("notepad.exe");
  const el = await app.find({ role: "textbox" })!;

  await expectElement(el).toBeVisible();
  await expectElement(el).toBeEnabled();
  await expectElement(el).toHaveText("");

  // Screenshot matcher
  const pixels = await el.screenshot();
  expectScreenshot(pixels).toBeBMP();
});

it.ci("only runs in CI", () => {
  // Skipped when not in CI environment
});

it.realDesktop("only runs on real desktop", async () => {
  // Skipped when using MockBackend
});

// Time measurement
// import { measureTime, measureAsync } from "@win-auto/core/testing";
const { result, durationMs } = await measureAsync(() => el.getText());
console.log(`getText took ${durationMs}ms`);

// Mock factories for setting up test state
// import { createMockElement, createMockWindow, createMockApp } from "@win-auto/core/testing";
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

Copyright (C) 2026 Mihail Damchevski

Licensed under AGPL-3.0.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Note:** This package is optimized for Windows platforms. Cross-platform support for macOS and Linux is not currently planned.
