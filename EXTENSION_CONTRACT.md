# Extension Contract — win-auto Plugin API

**Version:** 1.0  
**Status:** Stable (Phase 13)  
**Last updated:** 2026-06-18

---

## Core Principle

> New behavior goes through plugins. The core (`Automation`, `Backend`, `Element`, `Window`, `Locator`) only changes for correctness, performance, or platform compatibility.

---

## 1. Plugin Interface

All plugins implement the `Plugin` interface:

```typescript
interface Plugin {
  name: string;
  hooks: PluginHooks;
}

interface PluginHooks {
  onInstall?(automation: Automation): void;
  onUninstall?(): void;
  beforeAction?(action: string, params: Record<string, unknown>): Promise<void | false>;
  afterAction?(action: string, params: Record<string, unknown>, result: unknown): Promise<void>;
  onError?(action: string, params: Record<string, unknown>, error: Error): Promise<void>;
  resolveElement?(handle: string, windowHandle: string, selector?: LocatorFilter): Promise<Element | null>;
  filterLocator?(filter: LocatorFilter): Promise<LocatorFilter | null>;
  onTreeCaptured?(tree: ElementNode[], label: string): Promise<void>;
}
```

### Hook Descriptions

| Hook | When Called | Return Value |
|---|---|---|
| `onInstall` | Plugin registered via `automation.use(plugin)` | `void` |
| `onUninstall` | Plugin removed via `pluginManager.uninstall(name)` | `void` |
| `beforeAction` | Before any backend method call (see §2). Return `false` to cancel the action. | `void \| false` |
| `afterAction` | After a backend method call succeeds. | `void` |
| `onError` | When a backend method call throws. | `void` |
| `resolveElement` | During element resolution by handle. Return non-null to override default. | `Element \| null` |
| `filterLocator` | Before locator filter is applied. Return `null` to skip, or modified filter. | `LocatorFilter \| null` |
| `onTreeCaptured` | After a UI element tree snapshot is taken. | `void` |

---

## 2. Actions Hooked

The `PluginBackendProxy` uses a JavaScript `Proxy` to intercept **all** `Backend` method calls automatically and dispatches `beforeAction` / `afterAction` / `onError` hooks for every call. This guarantees 1:1 coverage — any method added to the `Backend` interface is instrumented without manual boilerplate.

A small number of methods that are simple synchronous getters with no side effects bypass the hooks for performance:

```
ping, getWindowInfo, getProcessImageName, isProcessRunning, isProcessElevated,
findProcessesByName, findDialogs, getDialogControls, buildElementPath,
getToggleState, inspectWindowTree, inspectHwndTree, debugDiscovery,
startWinEventWatcher, stopWinEventWatcher
```

> **Before v0.2.0:** The proxy manually wrapped only ~17 of ~97 backend methods. The Proxy-based rewrite (v0.2.0) structurally guarantees full coverage regardless of interface changes.

All hooks receive the action name (prefixed `backend:` + method name) and a `{ args }` params object containing the method arguments.

---

## 3. Backend Decorator Pattern

Plugins intercept at the `Backend` level via `PluginBackendProxy`:

```
User Code → Automation → PluginBackendProxy → NativeBackend / MockBackend
                                │
                    ┌───────────┴───────────┐
                    │  beforeAction hooks    │
                    │  afterAction hooks     │
                    │  onError hooks         │
                    └───────────────────────┘
```

The proxy is automatically installed by `Automation.use()` when the first plugin is registered. It delegates all 70+ backend methods and dispatches hooks for the actions listed in §2.

---

## 4. Lifecycle

1. **Installation:** `automation.use(myPlugin)` — calls `onInstall`, wraps backend with proxy on first plugin
2. **Usage:** Each backend call dispatches hooks in registration order
3. **Removal:** `automation.plugins.uninstall("my-plugin")` — calls `onUninstall`

---

## 5. Writing a Plugin

```typescript
import type { Plugin, PluginHooks, Automation } from "@win-auto/core";

class MyPlugin implements Plugin {
  readonly name = "my-plugin";
  readonly hooks: PluginHooks;

  constructor() {
    this.hooks = {
      onInstall: (automation: Automation) => {
        console.log(`MyPlugin installed`);
      },
      beforeAction: async (action: string, params: Record<string, unknown>) => {
        console.log(`[${action}] starting`);
      },
      afterAction: async (action: string, _params: Record<string, unknown>, _result: unknown) => {
        console.log(`[${action}] completed`);
      },
      onError: async (action: string, _params: Record<string, unknown>, error: Error) => {
        console.error(`[${action}] failed: ${error.message}`);
      },
    };
  }
}

// Usage:
const automation = new Automation();
automation.use(new MyPlugin());
```

---

## 6. Config-Based Plugin Loading

```typescript
// win-auto.config.ts
export default {
  plugins: [
    { name: "diagnostics", enabled: true, options: { screenshotOnFailure: true } },
    { name: "logging", options: { logLevel: "debug" } },
  ],
};
```

Call `await automation.usePlugins(config.plugins)` to load plugins from config.

---

## 7. Stability Guarantees

- The `Plugin` and `PluginHooks` interfaces are stable across minor versions.
- Hook parameter shapes (`PluginHooks.*`) will not change in breaking ways without a major version bump.
- The `PluginBackendProxy` uses a `Proxy`-based approach that automatically covers **every** method on the `Backend` interface — no manual wrapping needed when new methods are added.
- Plugins should not depend on internal (`private`/`protected`) APIs of core classes.

---

## 8. Built-in Plugins

| Plugin | Module | Description |
|---|---|---|
| `DiagnosticsPlugin` | `@win-auto/core` | Screenshot on failure, action-level diagnostics collection |
| `LoggingPlugin` | `@win-auto/core` | Console logging of actions, errors, and debug info |

---

## 9. Extension Boundaries (What Plugins Cannot Do)

- Plugins cannot modify the `Backend` interface itself (add/remove methods).
- Plugins cannot replace the `Backend` instance after construction.
- Plugins cannot access the native Rust addon directly.
- Plugins cannot modify Automation's constructor behavior.
