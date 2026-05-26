import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";
import type { ElementSelector, ImageMatch, LocatorFilter, WaitOptions } from "./types";
import { Element } from "./element";
import { classNamesForSelector } from "../native/classNames";
import { buildElementNotFoundError } from "./errors";

type LocatorStrategy =
  | { type: "selector"; selector: ElementSelector }
  | { type: "image"; template: number[] };

type PositionalSelector = "first" | "last" | { index: number };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MS = 100;

async function poll<T>(
  fn: () => Promise<T | null>,
  isValid: (t: T) => boolean,
  backend: Backend,
  options?: WaitOptions,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await fn();
    if (result !== null && isValid(result)) {
      return result;
    }
    await backend.waitForUiChange(intervalMs);
  }

  throw new Error(`Locator: element not found within ${timeoutMs}ms`);
}

async function pollImage(
  fn: () => Promise<ImageMatch | null>,
  backend: Backend,
  options?: WaitOptions & { minConfidence?: number },
): Promise<ImageMatch> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const minConfidence = options?.minConfidence ?? 0.8;
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await fn();
    if (result !== null && result.confidence >= minConfidence) {
      return result;
    }
    await backend.waitForUiChange(intervalMs);
  }

  throw new Error(`Locator: image not found within ${timeoutMs}ms`);
}

export class Locator {
  private readonly windowHandle: string;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;
  private readonly strategies: LocatorStrategy[];
  private readonly filters: LocatorFilter[];
  private readonly positional: PositionalSelector | null;
  private readonly scopeSelector: ElementSelector | null;

  constructor(
    windowHandle: string,
    backend: Backend,
    events: AutomationEvents,
    strategies: LocatorStrategy[] = [],
    filters: LocatorFilter[] = [],
    positional: PositionalSelector | null = null,
    scopeSelector: ElementSelector | null = null,
  ) {
    this.windowHandle = windowHandle;
    this.backend = backend;
    this.events = events;
    this.strategies = strategies;
    this.filters = filters;
    this.positional = positional;
    this.scopeSelector = scopeSelector;
  }

  /** Add a selector strategy. Can be chained for OR logic (multi-selector). */
  locator(selector: ElementSelector): Locator {
    return this.newWithStrategy({ type: "selector", selector });
  }

  /** Add an image template strategy (fallback or primary).
   *  Template should be PNG bytes as a number array. */
  image(template: number[]): Locator {
    return this.newWithStrategy({ type: "image", template });
  }

  /** Alias for .locator() — add another selector to try. */
  or(selector: ElementSelector): Locator {
    return this.locator(selector);
  }

  /** Add an image template as an alternative strategy. */
  orImage(template: number[]): Locator {
    return this.image(template);
  }

  /** Filter by element state. Multiple filters are AND-ed. */
  filter(f: LocatorFilter): Locator {
    return new Locator(
      this.windowHandle,
      this.backend,
      this.events,
      this.strategies,
      [...this.filters, f],
      this.positional,
      this.scopeSelector,
    );
  }

  /** Pick only the first matching element. */
  first(): Locator {
    return this.withPositional("first");
  }

  /** Pick only the last matching element. */
  last(): Locator {
    return this.withPositional("last");
  }

  /** Pick the nth matching element (0-indexed). */
  nth(index: number): Locator {
    return this.withPositional({ index });
  }

  // --- Actions ---

  async find(options?: WaitOptions): Promise<Element | null> {
    for (const strategy of this.strategies) {
      if (strategy.type === "selector") {
        const el = await this.findBySelector(strategy.selector);
        if (el) return el;
      }
    }
    return null;
  }

  async waitFor(options?: WaitOptions): Promise<Element> {
    if (this.strategies.length === 0) {
      throw new Error("Locator: no strategies defined. Call .locator() or .image() first.");
    }

    try {
      return await poll(
        () => this.find(options),
        () => true,
        this.backend,
        options,
      );
    } catch {
      // Build a rich error with available elements
      const firstSelector = this.strategies.find(s => s.type === "selector") as { type: "selector"; selector: ElementSelector } | undefined;
      if (firstSelector) {
        const msg = await buildElementNotFoundError(this.windowHandle, firstSelector.selector, this.backend, options);
        throw new Error(msg);
      }
      throw new Error(`Locator: element not found within ${options?.timeoutMs ?? 10_000}ms`);
    }
  }

  async click(options?: WaitOptions): Promise<void> {
    for (const strategy of this.strategies) {
      if (strategy.type === "selector") {
        const el = await this.waitForStrategy(strategy, options);
        if (el) {
          await el.click();
          return;
        }
      } else if (strategy.type === "image") {
        const match = await this.waitForImage(strategy.template, options);
        if (match) {
          await this.backend.mouseMove(match.x + Math.floor(match.width / 2), match.y + Math.floor(match.height / 2));
          await this.backend.clickElement(this.windowHandle);
          return;
        }
      }
    }
    throw new Error("Locator: all strategies exhausted");
  }

  async rightClick(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.rightClick();
  }

  async doubleClick(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.doubleClick();
  }

  async typeText(text: string, options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.typeText(text);
  }

  async getText(options?: WaitOptions): Promise<string> {
    const el = await this.waitFor(options);
    return el.getText();
  }

  async hover(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.hover();
  }

  async isVisible(options?: WaitOptions): Promise<boolean> {
    const el = await this.find(options);
    return el ? el.isVisible() : false;
  }

  async isEnabled(options?: WaitOptions): Promise<boolean> {
    const el = await this.find(options);
    return el ? el.isEnabled() : false;
  }

  async exists(options?: WaitOptions): Promise<boolean> {
    const el = await this.find(options);
    return el !== null;
  }

  async getValue(options?: WaitOptions): Promise<string> {
    const el = await this.waitFor(options);
    return el.getValue();
  }

  async setValue(value: string, options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.setValue(value);
  }

  async screenshot(options?: WaitOptions): Promise<number[]> {
    const el = await this.waitFor(options);
    return el.screenshot();
  }

  async select(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.select();
  }

  async toggle(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.toggle();
  }

  async scroll(direction: string, amount: number, options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.scroll(direction, amount);
  }

  /** Scoped locator: find this element, then create a locator scoped within it. */
  async locatorWithin(selector: ElementSelector, options?: WaitOptions): Promise<Locator> {
    const el = await this.waitFor(options);
    return new Locator(el.handle, this.backend, this.events, [{ type: "selector", selector }]);
  }

  /** Set a scope container for relative/structural queries.
   *  When set, all selector strategies will search within this container instead of the window root.
   *  Usage: `win.within({ name: "Address" }).locator({ role: "textbox" }).find()` */
  within(selector: ElementSelector): Locator {
    return new Locator(
      this.windowHandle,
      this.backend,
      this.events,
      this.strategies,
      this.filters,
      this.positional,
      selector,
    );
  }

  // --- Private helpers ---

  private newWithStrategy(strategy: LocatorStrategy): Locator {
    return new Locator(
      this.windowHandle,
      this.backend,
      this.events,
      [...this.strategies, strategy],
      this.filters,
      this.positional,
      this.scopeSelector,
    );
  }

  private withPositional(p: PositionalSelector): Locator {
    return new Locator(
      this.windowHandle,
      this.backend,
      this.events,
      this.strategies,
      this.filters,
      p,
      this.scopeSelector,
    );
  }

  private async findBySelector(selector: ElementSelector): Promise<Element | null> {
    // Resolve scope container first if set
    const searchHandle = this.scopeSelector
      ? await this.resolveScopeHandle()
      : this.windowHandle;

    if (searchHandle === null) return null;

    // 1) Find all matching handles within the scope
    const handles = await this.backend.findAll(
      searchHandle,
      classNamesForSelector(selector),
      selector.automationId,
      selector.name,
      selector.role,
      selector.className,
      selector.text,
      selector.matchMode,
    );

    if (handles.length === 0) return null;

    // 2) Apply positional selection
    const selected = this.selectPositional(handles);
    if (!selected) return null;

    // 3) Create elements (pass original selector for exists())
    let elements = selected.map((h) => new Element(h, this.windowHandle, this.backend, this.events, selector));

    // 4) Apply filters
    for (const f of this.filters) {
      elements = await this.applyFilter(elements, f);
      if (elements.length === 0) return null;
    }

    // 5) Re-apply positional after filtering
    if (this.positional) {
      elements = [elements[0]];
    }

    return elements[0] ?? null;
  }

  private selectPositional(handles: string[]): string[] | null {
    if (!this.positional) return handles;

    if (this.positional === "first") {
      return handles.length > 0 ? [handles[0]] : null;
    }
    if (this.positional === "last") {
      return handles.length > 0 ? [handles[handles.length - 1]] : null;
    }
    const idx = this.positional.index;
    return idx >= 0 && idx < handles.length ? [handles[idx]] : null;
  }

  private async applyFilter(elements: Element[], f: LocatorFilter): Promise<Element[]> {
    const results: Element[] = [];
    for (const el of elements) {
      if (f.visible !== undefined && (await el.isVisible()) !== f.visible) continue;
      if (f.enabled !== undefined && (await el.isEnabled()) !== f.enabled) continue;
      if (f.focused !== undefined && (await el.isFocused()) !== f.focused) continue;
      if (f.hasText !== undefined) {
        const text = await el.getText();
        if (!text.toLowerCase().includes(f.hasText.toLowerCase())) continue;
      }
      if (f.className !== undefined) {
        const cn = await el.getAttribute("className");
        if (!cn.toLowerCase().includes(f.className.toLowerCase())) continue;
      }
      if (f.automationId !== undefined) {
        const aid = await el.getAttribute("automationId");
        if (!aid.toLowerCase().includes(f.automationId.toLowerCase())) continue;
      }
      if (f.role !== undefined) {
        const r = await el.getAttribute("role");
        if (!r.toLowerCase().includes(f.role.toLowerCase())) continue;
      }
      results.push(el);
    }
    return results;
  }

  private async waitForStrategy(strategy: LocatorStrategy, options?: WaitOptions): Promise<Element | null> {
    if (strategy.type !== "selector") return null;
    try {
      return await poll(
        () => this.findBySelector(strategy.selector),
        () => true,
        this.backend,
        options,
      );
    } catch {
      return null;
    }
  }

  private async waitForImage(template: number[], options?: WaitOptions): Promise<ImageMatch | null> {
    return pollImage(
      () => this.backend.findImage(this.windowHandle, template),
      this.backend,
      options,
    ).catch(() => null);
  }

  private async resolveScopeHandle(): Promise<string | null> {
    if (!this.scopeSelector) return this.windowHandle;
    const handle = await this.backend.findElement(
      this.windowHandle,
      classNamesForSelector(this.scopeSelector),
      this.scopeSelector.automationId,
      this.scopeSelector.name,
      this.scopeSelector.role,
      this.scopeSelector.className,
      this.scopeSelector.text,
      this.scopeSelector.matchMode,
    );
    return handle;
  }
}
