# win-auto-core

[![npm version](https://img.shields.io/npm/v/win-auto-core.svg)](https://www.npmjs.com/package/win-auto-core)

Core TypeScript API for Windows desktop automation.

## Installation

```bash
npm install win-auto-core
```

## Quick Start

```typescript
import { Automation } from 'win-auto-core';

const automation = new Automation();
const app = await automation.launch('C:\\Windows\\System32\\notepad.exe');
const textbox = await app.find({ role: 'textbox' });
await textbox?.type('Hello from win-auto!');
```

## API

### Automation

Main entry point.

```typescript
const automation = new Automation();
const app = await automation.launch(executablePath);
```

### App

Launched application instance.

```typescript
const mainWindow = await app.getMainWindow();
const element = await app.find({ role: 'button', name: 'OK' });
```

### Window

Window in the application.

```typescript
const element = await window.findElement({ role: 'textbox' });
```

### Element

UI element for interaction.

```typescript
await element.typeText('Hello');
await element.click();
```

## Testing Support

Export testing utilities:

```typescript
import { setupAutomation } from 'win-auto-core/testing';
```

## Requirements

- Windows 10/11
- Node.js 18+

## Documentation

See the [main README](../../README.md) for complete documentation, examples, and troubleshooting.

## License

MIT
