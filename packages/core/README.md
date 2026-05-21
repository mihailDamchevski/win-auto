# @win-auto/core

Core TypeScript API for Windows desktop automation.

## Installation

```bash
npm install @win-auto/core
```

## Quick Start

```typescript
import { Automation } from '@win-auto/core';

const automation = new Automation();
const app = await automation.launch('C:\\Windows\\System32\\notepad.exe');
const textbox = await app.find({ role: 'textbox' });
await textbox?.type('Hello from win-auto!');
```

## API

### Automation

Main entry point. Accepts an optional `Backend` (defaults to `NativeBackend`).

```typescript
import { Automation, MockBackend } from '@win-auto/core';

// Real Windows automation
const real = new Automation();

// Mock backend for unit tests
const mock = new Automation(new MockBackend());
```

### App

Launched application instance.

```typescript
const mainWindow = await app.getMainWindow();
const windows = await app.listWindows();
const element = await app.find({ role: 'button', name: 'OK' });
await app.close({ timeoutMs: 5000 });
```

### Window

Window management and element discovery.

```typescript
// Element finding
const el = await window.findElement({ role: 'textbox' });
const all = await window.findAll({ role: 'button' });
await window.clickElementByName('Save');
await window.clickSequence(['File', 'Save As']);

// Window state
const bounds = await window.getBounds();
await window.setBounds({ left: 0, top: 0, width: 800, height: 600 });
await window.maximize();
await window.minimize();
await window.restore();

// Input
await window.typeText('Hello');
await window.pressKey('Ctrl+S');
await window.close();
```

### Element

UI element for interaction and inspection.

```typescript
// Interaction
await element.typeText('Hello');
await element.click();
await element.select();
await element.toggle();

// Value access
const value = await element.getValue();
const text = await element.getText();
await element.setValue('new value');

// State queries
const visible = await element.isVisible();
const enabled = await element.isEnabled();
const focused = await element.isFocused();
const toggleState = await element.getToggleState();

// Tree navigation
const parent = await element.getParent();
const children = await element.getChildren();
const siblings = await element.getSiblings();
```

### Backend

Pluggable backends for the automation engine:

- **`NativeBackend`** - Real Windows automation via Rust/napi-rs (default)
- **`MockBackend`** - In-memory simulation for testing without a desktop

```typescript
import { Automation, NativeBackend, MockBackend } from '@win-auto/core';

const real = new Automation(new NativeBackend());
const mock = new Automation(new MockBackend());
```

## Testing Support

```typescript
// Auto-track and cleanup launched apps
import { TestAutomation, closeTrackedApps } from '@win-auto/core';
// or: import { TestAutomation, closeTrackedApps } from '@win-auto/core/testing';

describe('my tests', () => {
  afterAll(() => closeTrackedApps());

  it('works', async () => {
    const auto = new TestAutomation();
    const app = await auto.launch('notepad.exe');
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

MIT
