# @win-auto/core

Core TypeScript API for Windows desktop automation.

## Installation

```bash
npm install @win-auto/core
```

## Quick Start

```typescript
import { Automation } from "@win-auto/core";

const automation = new Automation();
const app = await automation.launch("C:\\Windows\\System32\\notepad.exe");
const textbox = await app.find({ role: "textbox" });
await textbox?.type("Hello from win-auto!");
```

## API

### Automation

Main entry point. Accepts an optional `Backend` (defaults to `NativeBackend`).

```typescript
import { Automation, MockBackend } from "@win-auto/core";

// Real Windows automation
const real = new Automation();

// Mock backend for unit tests
const mock = new Automation(new MockBackend());

// Move the mouse cursor to absolute coordinates
await automation.mouseMove(500, 300);

// Find running processes by name
const notepads = automation.processes.findByName("notepad.exe");

// Connect to an already-running app
const app = await automation.connectProcess("notepad.exe");

// Subscribe to automation events
automation.events.on("app:launched", (data) => console.log("PID:", data.processId));
automation.events.on("element:clicked", (data) => console.log("Clicked:", data.handle));

// Watch raw Windows events
automation.startWinEventWatcher();
automation.events.on("winEvent", (e) => console.log(e.eventType, e.hwnd));
```

### App

Launched application instance. Provides access to windows, elements, and dialogs.

```typescript
const mainWindow = await app.getMainWindow();
const windows = await app.listWindows();
const element = await app.find({ role: "button", name: "OK" });
await app.close({ timeoutMs: 5000 });

// Lifecycle management
const running = await app.isRunning();
await app.waitForExit(10000);
await app.kill();

// Wait for elements via the main window
const btn = await app.waitForElement({ name: "OK" }, { timeoutMs: 5000 });
const visible = await app.waitForVisible({ name: "OK" });

// Dialog handling
const dialog = await app.dialogs.waitFor({ title: "Open", timeoutMs: 5000 });
await dialog.selectFile("C:\\path\\file.txt");
await dialog.accept();
```

### Window

Window management and element discovery.

```typescript
// Element finding
const el = await window.findElement({ role: "textbox" });
const all = await window.findAll({ role: "button" });
await window.clickElementByName("Save");
await window.clickSequence(["File", "Save As"]);

// Locator with healing
const btn = await window.locator({ name: "OK" }).heal({ threshold: 0.5 }).find();

// Window state
const bounds = await window.getBounds();
await window.setBounds({ left: 0, top: 0, width: 800, height: 600 });
await window.maximize();
await window.minimize();
await window.restore();

// Input
await window.typeText("Hello");
await window.pressKey("Ctrl+S");

// Hold/release modifier keys
await window.keyDown("Ctrl");
await window.pressKey("A");
await window.keyUp("Ctrl");

// Inspect UI tree
const tree = window.inspectTree(5);

// Screenshots
const pixels = await window.screenshot();
await window.screenshotToFile("window.bmp");

// Wait for elements
const btn2 = await window.waitForElement({ name: "OK" }, { timeoutMs: 5000 });
const visible = await window.waitForVisible({ name: "OK" });
const enabled = await window.waitForEnabled({ name: "OK" });

// Structural navigation via Locator
const parent = await window.locator({ name: "OK" }).parent();
const next = await window.locator({ role: "button" }).next();
const ancestor = await window.locator({ name: "OK" }).ancestor({ automationId: "toolbar" });

// Wait for window to close
await window.waitForClosed({ timeoutMs: 5000 });

await window.close();
```

### Element

UI element for interaction and inspection.

```typescript
// Interaction
await element.typeText("Hello");
await element.click();
await element.rightClick();
await element.doubleClick();
await element.hover();
await element.scroll("down", 3);
await element.dragDrop(targetElement);
await element.select();
await element.toggle();

// Value access
const value = await element.getValue();
const text = await element.getText();
await element.setValue("new value");

// State queries
const visible = await element.isVisible();
const enabled = await element.isEnabled();
const focused = await element.isFocused();
const toggleState = await element.getToggleState();

// Class name (Win32 window class)
const className = await element.getClassName();

// Read arbitrary UIA attributes
const name = await element.getAttribute("name");
const role = await element.getAttribute("role");
const bounds = await element.getAttribute("bounds");
const legacyName = await element.getAttribute("legacyName"); // MSAA fallback
// getProperty is an alias
const autoId = await element.getProperty("automationId");

// Wait for element state (positive)
await element.waitForVisible({ timeoutMs: 5000 });
await element.waitForEnabled();

// Wait for element state (inverse)
await element.waitForNotVisible({ timeoutMs: 5000 });
await element.waitForNotEnabled();
await element.waitForRemoved();

// Structural navigation
const parent = await element.parent();
const next = await element.next({ role: "button" });
const prev = await element.previous();
const ancestor = await element.ancestor({ automationId: "mainPanel" });
const relative = await element.findRelative(
  { role: "button", name: "OK" },
  { relation: "ancestor", direction: "up" },
);

// Tree navigation (legacy)
await element.getParent();
await element.getChildren();
await element.getSiblings();

// Text selection
await element.selectText();
const selected = await element.getSelection();
await element.replaceSelectedText("replacement");

// Keyboard modifiers
await element.keyDown("Shift");
await element.keyUp("Shift");

// Screenshots
const pixels = await element.screenshot();
await element.screenshotToFile("element.bmp");
```

### Healing Engine

`Locator.heal()` auto-generates 8 fallback strategies when the primary selector fails:

```typescript
const btn = await window.locator({ name: "OK" }).heal({ threshold: 0.5 }).find();

// Parallel strategy search (fastest high-confidence match wins)
const btn = await window
  .locator({ name: "OK" })
  .heal({ threshold: 0.7, parallel: true })
  .waitFor({ timeoutMs: 5000 });
```

### Fluent Wait API

```typescript
import { wait } from "@win-auto/core";

await wait
  .until(() => element.getText())
  .matches(/loaded/)
  .for(10000);
await wait
  .until(element)
  .isVisible()
  .and((el) => el.getText().then((t) => t.includes("ready")))
  .for(10000);

// Inverse waits
await element.waitForNotVisible({ timeoutMs: 5000 });
await element.waitForRemoved();
await window.waitForClosed();
```

### Structural Navigation

```typescript
await element.parent();
await element.next({ role: "button" });
await element.previous();
await element.ancestor({ automationId: "mainPanel" });
await locator.parent();
await locator.next({ role: "textbox" });
```

### Events

Every `Automation` instance exposes an `events` EventEmitter. Subscribe to lifecycle events for logging, debugging, or tracking:

```typescript
automation.events.on("app:launched", (data) => {
  console.log(`Launched ${data.executablePath} (PID ${data.processId})`);
});

automation.events.on("element:clicked", (data) => {
  console.log(`Element ${data.handle} was clicked`);
});

automation.events.on("winEvent", (event) => {
  console.log("WinEvent:", event.eventType, "HWND:", event.hwnd);
});

automation.events.on("debug", (data) => {
  console.debug("[auto]", data.message);
});
```

### Fluent Wait API

```typescript
import { wait } from "@win-auto/core";

// Basic
await wait
  .until(() => element.getText())
  .matches(/loaded/)
  .for(10000);
await wait.until(window).isVisible().for(5000);
await wait.until(element).isEnabled();

// Compound
await wait
  .until(element)
  .isVisible()
  .and((el) => el.getText().then((t) => t.includes("ready")))
  .for(10000);

// Adaptive polling
await wait.until(element).isVisible().adaptive().for(10000);
```

### Backend

Pluggable backends for the automation engine:

- **`NativeBackend`** - Real Windows automation via Rust/napi-rs (default)
- **`MockBackend`** - In-memory simulation for testing without a desktop

```typescript
import { Automation, NativeBackend, MockBackend } from "@win-auto/core";

const real = new Automation(new NativeBackend());
const mock = new Automation(new MockBackend());
```

## Testing Support

```typescript
// Auto-track and cleanup launched apps
import { TestAutomation, closeTrackedApps } from "@win-auto/core";
// or: import { TestAutomation, closeTrackedApps } from '@win-auto/core/testing';

describe("my tests", () => {
  afterAll(() => closeTrackedApps());

  it("works", async () => {
    const auto = new TestAutomation();
    const app = await auto.launch("notepad.exe");
    // app is automatically tracked — closed by closeTrackedApps()
  });
});
```

## Requirements

- Windows 10/11
- Node.js 18+

## Documentation

See the [main README](../../README.md) for complete documentation, examples, and troubleshooting.

## License

AGPL-3.0
