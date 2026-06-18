import type { Element } from "./element";
import type { LocatorFilter, ElementNode } from "./types";
import type { Automation } from "./automation";

// ─── Plugin lifecycle hooks ────────────────────────────────────────────

export interface PluginHooks {
  /** Called when the plugin is installed on an Automation instance. */
  onInstall?(automation: Automation): void;
  /** Called when the plugin is uninstalled. */
  onUninstall?(): void;
  /** Intercept action before execution. Return `false` to cancel. */
  beforeAction?(action: string, params: Record<string, unknown>): Promise<void | false>;
  /** Observe action result after execution. */
  afterAction?(action: string, params: Record<string, unknown>, result: unknown): Promise<void>;
  /** React to action errors. */
  onError?(action: string, params: Record<string, unknown>, error: Error): Promise<void>;
  /** Resolve an element by handle. Return null to fall through to default. */
  resolveElement?(handle: string, windowHandle: string, selector?: LocatorFilter): Promise<Element | null>;
  /** Modify or replace a locator filter before resolution. Return null to skip. */
  filterLocator?(filter: LocatorFilter): Promise<LocatorFilter | null>;
  /** Called when an element tree is captured (for recording/monitoring). */
  onTreeCaptured?(tree: ElementNode[], label: string): Promise<void>;
}

// ─── Plugin interface ──────────────────────────────────────────────────

export interface Plugin {
  readonly name: string;
  readonly hooks: PluginHooks;
}

// ─── Plugin registration config ────────────────────────────────────────

export type PluginConfig = {
  name: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
};

// ─── PluginManager ─────────────────────────────────────────────────────

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private automation: Automation;

  constructor(automation: Automation) {
    this.automation = automation;
  }

  /** Register a plugin. Throws if a plugin with the same name is already installed. */
  install(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already installed`);
    }
    this.plugins.set(plugin.name, plugin);
    plugin.hooks.onInstall?.(this.automation);
  }

  /** Unregister a plugin by name. */
  uninstall(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    plugin.hooks.onUninstall?.();
    this.plugins.delete(name);
    return true;
  }

  /** Check if a plugin is installed. */
  isInstalled(name: string): boolean {
    return this.plugins.has(name);
  }

  /** Get a plugin by name. */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /** List all installed plugins. */
  list(): Plugin[] {
    return [...this.plugins.values()];
  }

  // ─── Hook dispatchers ───────────────────────────────────────────────

  async dispatchBeforeAction(action: string, params: Record<string, unknown>): Promise<boolean> {
    for (const plugin of this.plugins.values()) {
      const result = await plugin.hooks.beforeAction?.(action, params);
      if (result === false) return false;
    }
    return true;
  }

  async dispatchAfterAction(action: string, params: Record<string, unknown>, result: unknown): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.hooks.afterAction?.(action, params, result);
    }
  }

  async dispatchOnError(action: string, params: Record<string, unknown>, error: Error): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.hooks.onError?.(action, params, error);
    }
  }

  async dispatchResolveElement(
    handle: string,
    windowHandle: string,
    selector?: LocatorFilter,
  ): Promise<Element | null> {
    for (const plugin of this.plugins.values()) {
      const result = await plugin.hooks.resolveElement?.(handle, windowHandle, selector);
      if (result !== null && result !== undefined) return result;
    }
    return null;
  }

  async dispatchFilterLocator(filter: LocatorFilter): Promise<LocatorFilter | null> {
    for (const plugin of this.plugins.values()) {
      const result = await plugin.hooks.filterLocator?.(filter);
      if (result === null) return null;
      if (result !== undefined) filter = result;
    }
    return filter;
  }

  async dispatchTreeCaptured(tree: ElementNode[], label: string): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.hooks.onTreeCaptured?.(tree, label);
    }
  }
}
