import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";
import type { ElementSelector, ImageMatch, LocatorFilter, WaitOptions } from "./types";
import { Element } from "./element";
import { classNamesForSelector } from "../native/classNames";
import { AutomationError, buildElementNotFoundError, TimeoutError } from "./errors";

type LocatorStrategy =
  | { type: "selector"; selector: ElementSelector }
  | { type: "image"; template: number[] };

type PositionalSelector = "first" | "last" | { index: number };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MS = 100;

// --- Healing engine ---

interface HealedResult {
  handle: string;
  confidence: number;
  strategyName: string;
}

const STRATEGY_DEFS = [
  {
    name: "exact-all",
    confidence: 1.0,
    build: (s: ElementSelector) => ({ ...s, matchMode: "exact" as const }),
  },
  {
    name: "exact-automationId",
    confidence: 0.95,
    build: (s: ElementSelector) =>
      s.automationId ? { automationId: s.automationId, matchMode: "exact" as const } : null,
  },
  {
    name: "exact-name",
    confidence: 0.85,
    build: (s: ElementSelector) => (s.name ? { name: s.name, matchMode: "exact" as const } : null),
  },
  {
    name: "substring-name+role",
    confidence: 0.75,
    build: (s: ElementSelector) => {
      const r: ElementSelector = { matchMode: "substring" as const };
      if (s.name) r.name = s.name;
      if (s.role) r.role = s.role;
      return r.name || r.role ? r : null;
    },
  },
  {
    name: "substring-name+className",
    confidence: 0.7,
    build: (s: ElementSelector) => {
      const r: ElementSelector = { matchMode: "substring" as const };
      if (s.name) r.name = s.name;
      if (s.className) r.className = s.className;
      return r.name || r.className ? r : null;
    },
  },
  {
    name: "substring-role+className",
    confidence: 0.65,
    build: (s: ElementSelector) => {
      const r: ElementSelector = { matchMode: "substring" as const };
      if (s.role) r.role = s.role;
      if (s.className) r.className = s.className;
      return r.role || r.className ? r : null;
    },
  },
  {
    name: "substring-name",
    confidence: 0.5,
    build: (s: ElementSelector) =>
      s.name ? { name: s.name, matchMode: "substring" as const } : null,
  },
  {
    name: "substring-all",
    confidence: 0.3,
    build: (s: ElementSelector) => ({ ...s, matchMode: "substring" as const }),
  },
];

const strategyCache = new Map<string, { strategyName: string; handle: string }>();

function cacheKey(s: ElementSelector): string {
  return `aid:${s.automationId ?? ""}|name:${s.name ?? ""}|role:${s.role ?? ""}|cn:${s.className ?? ""}`;
}

function debugLog(...args: unknown[]): void {
  if (typeof process !== "undefined" && process.env?.WIN_AUTO_DEBUG_LOCATORS) {
    console.debug("[HealingLocator]", ...args);
  }
}

function generateFallbackSelectors(
  original: ElementSelector,
): Array<{ selector: ElementSelector; strategyName: string; confidence: number }> {
  const results: Array<{ selector: ElementSelector; strategyName: string; confidence: number }> =
    [];
  for (const def of STRATEGY_DEFS) {
    const sel = def.build(original);
    if (sel) results.push({ selector: sel, strategyName: def.name, confidence: def.confidence });
  }
  return results;
}

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

  throw new TimeoutError(`Locator: element not found within ${timeoutMs}ms`, "poll", timeoutMs);
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

  throw new TimeoutError(`Locator: image not found within ${timeoutMs}ms`, "pollImage", timeoutMs);
}

export class Locator {
  private readonly windowHandle: string;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;
  private readonly strategies: LocatorStrategy[];
  private readonly filters: LocatorFilter[];
  private readonly positional: PositionalSelector | null;
  private readonly scopeSelector: ElementSelector | null;
  private healEnabled = false;
  private healThreshold = 0.5;
  private healParallel = true;

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

  /** Enable healing mode: auto-generates fallback strategies and applies confidence scoring.
   *  When enabled, find() tries progressively looser selectors if the primary match fails.
   *  waitFor() runs all strategies in parallel on each poll cycle. */
  heal(options?: { threshold?: number; parallel?: boolean }): this {
    this.healEnabled = true;
    this.healThreshold = options?.threshold ?? 0.5;
    this.healParallel = options?.parallel ?? true;
    return this;
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
    return this.newClone({ filters: [...this.filters, f] });
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

  async find(_options?: WaitOptions): Promise<Element | null> {
    for (const strategy of this.strategies) {
      if (strategy.type === "selector") {
        const el = await this.findBySelector(strategy.selector);
        if (el) return el;

        // Healing: auto-generate fallback selectors when primary fails
        if (this.healEnabled) {
          const fallbacks = generateFallbackSelectors(strategy.selector);
          const ck = cacheKey(strategy.selector);
          const cached = strategyCache.get(ck);

          if (cached) {
            debugLog(`cache hit for ${ck}: trying ${cached.strategyName} first`);
            const cachedEl = await this.findBySelector(
              fallbacks.find((f) => f.strategyName === cached.strategyName)?.selector ??
                strategy.selector,
            );
            if (cachedEl) {
              debugLog(`cache hit succeeded: ${cached.strategyName}`);
              return cachedEl;
            }
          }

          for (const fb of fallbacks) {
            if (fb.confidence < this.healThreshold) {
              debugLog(
                `skipping ${fb.strategyName} (confidence ${fb.confidence} < threshold ${this.healThreshold})`,
              );
              continue;
            }
            debugLog(`trying fallback ${fb.strategyName} (confidence ${fb.confidence})`);
            const fbEl = await this.findBySelector(fb.selector);
            if (fbEl) {
              debugLog(`fallback ${fb.strategyName} succeeded`);
              strategyCache.set(ck, { strategyName: fb.strategyName, handle: fbEl.handle });
              return fbEl;
            }
          }
        }
      }
    }
    return null;
  }

  async waitFor(options?: WaitOptions): Promise<Element> {
    if (this.strategies.length === 0) {
      throw new AutomationError(
        "Locator: no strategies defined. Call .locator() or .image() first.",
      );
    }

    if (this.healEnabled && this.healParallel) {
      // Parallel healing: run all fallback strategies concurrently on each poll cycle
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
      const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const results = await Promise.all(
          this.strategies
            .filter(
              (s): s is { type: "selector"; selector: ElementSelector } => s.type === "selector",
            )
            .flatMap((s) => {
              const fallbacks = generateFallbackSelectors(s.selector).filter(
                (fb) => fb.confidence >= this.healThreshold,
              );
              // Include the original selector as highest-confidence
              return [
                { strategyName: "original", confidence: 1.0, selector: s.selector },
                ...fallbacks,
              ].map((fb) =>
                this.findBySelector(fb.selector).then((el) =>
                  el
                    ? {
                        handle: el.handle,
                        confidence: fb.confidence,
                        strategyName: fb.strategyName,
                      }
                    : null,
                ),
              );
            }),
        );

        const best = results
          .filter((r): r is HealedResult => r !== null)
          .sort((a, b) => b.confidence - a.confidence)[0];

        if (best) {
          const el = new Element(best.handle, this.windowHandle, this.backend, this.events);
          debugLog(`parallel healing: ${best.strategyName} (confidence ${best.confidence})`);
          return el;
        }

        if (attempt < maxAttempts - 1) {
          await this.backend.waitForUiChange(intervalMs);
        }
      }

      const firstSelector = this.strategies.find((s) => s.type === "selector") as
        | { type: "selector"; selector: ElementSelector }
        | undefined;
      if (firstSelector) {
        throw await buildElementNotFoundError(
          this.windowHandle,
          firstSelector.selector,
          this.backend,
          options,
        );
      }
      throw new TimeoutError(
        `Locator: element not found within ${timeoutMs}ms (healing)`,
        "waitFor",
        timeoutMs,
      );
    }

    try {
      return await poll(
        () => this.find(options),
        () => true,
        this.backend,
        options,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        // Build a rich error with available elements
        const firstSelector = this.strategies.find((s) => s.type === "selector") as
          | { type: "selector"; selector: ElementSelector }
          | undefined;
        if (firstSelector) {
          throw await buildElementNotFoundError(
            this.windowHandle,
            firstSelector.selector,
            this.backend,
            options,
          );
        }
      }
      throw err;
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
          await this.backend.mouseMove(
            match.x + Math.floor(match.width / 2),
            match.y + Math.floor(match.height / 2),
          );
          await this.backend.clickElement(this.windowHandle);
          return;
        }
      }
    }
    throw new AutomationError("Locator: all strategies exhausted");
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

  async focus(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.focus();
  }

  async clear(options?: WaitOptions): Promise<void> {
    const el = await this.waitFor(options);
    await el.clear();
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

  async parent(options?: WaitOptions): Promise<Element | null> {
    const el = await this.waitFor(options);
    return el.parent();
  }

  async next(selector?: ElementSelector, options?: WaitOptions): Promise<Element | null> {
    const el = await this.waitFor(options);
    return el.next(selector);
  }

  async previous(selector?: ElementSelector, options?: WaitOptions): Promise<Element | null> {
    const el = await this.waitFor(options);
    return el.previous(selector);
  }

  async ancestor(selector: ElementSelector, options?: WaitOptions): Promise<Element | null> {
    const el = await this.waitFor(options);
    return el.ancestor(selector);
  }

  async findRelative(
    selector: ElementSelector,
    relOptions?: { relation: "parent" | "ancestor" | "next" | "previous" | "child" },
    options?: WaitOptions,
  ): Promise<Element | null> {
    const el = await this.waitFor(options);
    return el.findRelative(selector, relOptions);
  }

  /** Scoped locator: find this element, then create a locator scoped within it. */
  async locatorWithin(selector: ElementSelector, options?: WaitOptions): Promise<Locator> {
    const el = await this.waitFor(options);
    const l = new Locator(el.handle, this.backend, this.events, [{ type: "selector", selector }]);
    l.healEnabled = this.healEnabled;
    l.healThreshold = this.healThreshold;
    l.healParallel = this.healParallel;
    return l;
  }

  /** Set a scope container for relative/structural queries.
   *  When set, all selector strategies will search within this container instead of the window root.
   *  Usage: `win.within({ name: "Address" }).locator({ role: "textbox" }).find()` */
  within(selector: ElementSelector): Locator {
    return this.newClone({ scopeSelector: selector });
  }

  // --- Private helpers ---

  private newClone(overrides: {
    strategies?: LocatorStrategy[];
    filters?: LocatorFilter[];
    positional?: PositionalSelector | null;
    scopeSelector?: ElementSelector | null;
  }): Locator {
    const l = new Locator(
      this.windowHandle,
      this.backend,
      this.events,
      overrides.strategies ?? this.strategies,
      overrides.filters ?? this.filters,
      overrides.positional !== undefined ? overrides.positional : this.positional,
      overrides.scopeSelector !== undefined ? overrides.scopeSelector : this.scopeSelector,
    );
    l.healEnabled = this.healEnabled;
    l.healThreshold = this.healThreshold;
    l.healParallel = this.healParallel;
    return l;
  }

  private newWithStrategy(strategy: LocatorStrategy): Locator {
    return this.newClone({ strategies: [...this.strategies, strategy] });
  }

  private withPositional(p: PositionalSelector): Locator {
    return this.newClone({ positional: p });
  }

  private async findBySelector(selector: ElementSelector): Promise<Element | null> {
    // Resolve scope container first if set
    const searchHandle = this.scopeSelector ? await this.resolveScopeHandle() : this.windowHandle;

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
    let elements = selected.map(
      (h) => new Element(h, this.windowHandle, this.backend, this.events, selector),
    );

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

  private async waitForStrategy(
    strategy: LocatorStrategy,
    options?: WaitOptions,
  ): Promise<Element | null> {
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

  private async waitForImage(
    template: number[],
    options?: WaitOptions,
  ): Promise<ImageMatch | null> {
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
