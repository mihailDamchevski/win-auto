import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";
import type { ElementNode, ElementSelector, FindFirstOptions, HwndNode, ImageMatch, LocatorFilter, WindowBounds } from "./types";
import { Element } from "./element";
import { Locator } from "./locator";
import { classNamesForSelector } from "../native/classNames";
import { buildElementNotFoundError } from "./errors";

const DEFAULT_TIMEOUT_MS = 10_000;

export class Window {
  public readonly handle: string;
  public readonly processId: number;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;

  constructor(handle: string, processId: number, backend: Backend, events: AutomationEvents) {
    this.handle = handle;
    this.processId = processId;
    this.backend = backend;
    this.events = events;
  }

  /** Create a fluent locator for chained queries. */
  public locator(selector: ElementSelector): Locator {
    return new Locator(this.handle, this.backend, this.events, [{ type: "selector", selector }]);
  }

  /** Try multiple selectors, return the first match. */
  public async findFirst(
    selectors: ElementSelector[],
    options?: FindFirstOptions,
  ): Promise<Element | null> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const intervalMs = options?.intervalMs ?? 100;
    const parallel = options?.parallel ?? true;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    const start = Date.now();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (parallel) {
        const results = await Promise.all(
          selectors.map((s) => this.findElement(s)),
        );
        for (const el of results) {
          if (el) return el;
        }
      } else {
        for (const selector of selectors) {
          const el = await this.findElement(selector);
          if (el) return el;
        }
      }
      if (Date.now() - start < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } else {
        break;
      }
    }
    return null;
  }

  /** Find an element by image template matching. */
  public async findImage(template: number[]): Promise<ImageMatch | null> {
    return this.backend.findImage(this.handle, template);
  }

  public async findElement(selector: ElementSelector): Promise<Element | null> {
    const elementHandle = await this.backend.findElement(
      this.handle,
      classNamesForSelector(selector),
      selector.automationId,
      selector.name,
      selector.role,
      selector.className,
      selector.text,
      selector.matchMode,
    );
    if (!elementHandle) {
      return null;
    }
    this.events.emitElementFound(elementHandle, selector as Record<string, unknown>);
    return new Element(elementHandle, this.handle, this.backend, this.events, selector);
  }

  public async find(selector: ElementSelector): Promise<Element | null> {
    return this.findElement(selector);
  }

  public async findElements(selector: ElementSelector): Promise<Element[]> {
    const handles = await this.backend.findAll(
      this.handle,
      classNamesForSelector(selector),
      selector.automationId,
      selector.name,
      selector.role,
      selector.className,
      selector.text,
      selector.matchMode,
    );
    return handles.map((h) => new Element(h, this.handle, this.backend, this.events, selector));
  }

  public async typeText(text: string): Promise<void> {
    await this.backend.sendKeys(this.handle, text);
  }

  public async findElementName(name: string): Promise<string | null> {
    return this.backend.findElementName(this.handle, name);
  }

  public async clickElementByName(name: string): Promise<void> {
    await this.backend.clickElementByName(this.handle, name);
  }

  public async clickSequence(names: string[]): Promise<void> {
    await this.backend.clickSequence(this.handle, names);
  }

  public async pressKeyCodes(keyCodes: number[]): Promise<void> {
    await this.backend.pressKeyCodes(this.handle, keyCodes);
  }

  public async close(): Promise<void> {
    await this.backend.closeWindow(this.handle);
    this.events.emitWindowClosed(this.handle);
  }

  public async findAll(selector: ElementSelector): Promise<string[]> {
    return this.backend.findAll(
      this.handle,
      classNamesForSelector(selector),
      selector.automationId,
      selector.name,
      selector.role,
      selector.className,
      selector.text,
      selector.matchMode,
    );
  }

  public async getChildren(): Promise<string[]> {
    return this.backend.getChildren(this.handle);
  }

  public async getBounds(): Promise<WindowBounds> {
    return this.backend.getWindowBounds(this.handle);
  }

  public async setBounds(bounds: WindowBounds): Promise<void> {
    await this.backend.setWindowBounds(
      this.handle,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
    );
    this.events.emitWindowBoundsChanged(this.handle, bounds as Record<string, unknown>);
  }

  public async maximize(): Promise<void> {
    await this.backend.maximizeWindow(this.handle);
    this.events.emitWindowMaximized(this.handle);
  }

  public async minimize(): Promise<void> {
    await this.backend.minimizeWindow(this.handle);
    this.events.emitWindowMinimized(this.handle);
  }

  public async restore(): Promise<void> {
    await this.backend.restoreWindow(this.handle);
    this.events.emitWindowRestored(this.handle);
  }

  public async pressKey(keyCombination: string): Promise<void> {
    await this.backend.pressKey(this.handle, keyCombination);
  }

  public async keyDown(key: string): Promise<void> {
    await this.backend.keyDown(this.handle, key);
  }

  public async keyUp(key: string): Promise<void> {
    await this.backend.keyUp(this.handle, key);
  }

  public async focus(): Promise<void> {
    await this.backend.focusWindow(this.handle);
  }

  public inspectTree(maxDepth?: number): ElementNode[] {
    return this.backend.inspectWindowTree(this.handle, maxDepth);
  }

  public inspectHwndTree(maxDepth?: number): HwndNode[] {
    return this.backend.inspectHwndTree(this.handle, maxDepth);
  }

  public async screenshot(): Promise<number[]> {
    const result = await this.backend.captureScreenshot(this.handle);
    this.events.emitElementScreenshot(this.handle);
    return result;
  }

  public async screenshotToFile(path: string): Promise<void> {
    await this.backend.captureScreenshotToFile(this.handle, path);
    this.events.emitElementScreenshot(this.handle);
  }

  public async waitForElement(
    selector: ElementSelector,
    options?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<Element> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const element = await this.findElement(selector);
      if (element) {
        return element;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const msg = await buildElementNotFoundError(this.handle, selector, this.backend, { timeoutMs, intervalMs });
    throw new Error(msg);
  }

  public async waitForVisible(
    selector: ElementSelector,
    options?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<Element> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const element = await this.findElement(selector);
      if (element && (await element.isVisible())) {
        return element;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const msg = await buildElementNotFoundError(this.handle, selector, this.backend, { timeoutMs, intervalMs });
    throw new Error(msg);
  }

  public async waitForEnabled(
    selector: ElementSelector,
    options?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<Element> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const element = await this.findElement(selector);
      if (element && (await element.isEnabled())) {
        return element;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const msg = await buildElementNotFoundError(this.handle, selector, this.backend, { timeoutMs, intervalMs });
    throw new Error(msg);
  }
}
