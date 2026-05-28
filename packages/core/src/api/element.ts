import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";
import type { ElementPath, ElementSelector } from "./types";
import { classNamesForSelector } from "../native/classNames";
import { StaleElementError, TimeoutError, isStaleError } from "./errors";

export class Element {
  public handle: string;
  public readonly windowHandle: string;
  public readonly backend: Backend;
  public readonly events: AutomationEvents;
  public readonly originalSelector?: ElementSelector;

  constructor(
    handle: string,
    windowHandle: string,
    backend: Backend,
    events: AutomationEvents,
    originalSelector?: ElementSelector,
  ) {
    this.handle = handle;
    this.windowHandle = windowHandle;
    this.backend = backend;
    this.events = events;
    this.originalSelector = originalSelector;
  }

  private async tryResolve(): Promise<boolean> {
    if (!this.originalSelector) {
      return false;
    }
    try {
      const newHandle = await this.backend.findElement(
        this.windowHandle,
        classNamesForSelector(this.originalSelector),
        this.originalSelector.automationId ?? null,
        this.originalSelector.name ?? null,
        this.originalSelector.role ?? null,
        this.originalSelector.className ?? null,
        this.originalSelector.text ?? null,
        this.originalSelector.matchMode ?? null,
      );
      if (newHandle && newHandle !== this.handle) {
        this.handle = newHandle;
        this.events.emitElementFound(newHandle, this.originalSelector);
        return true;
      }
      return !!newHandle;
    } catch {
      return false;
    }
  }

  public async isStale(): Promise<boolean> {
    if (!this.originalSelector) {
      return false;
    }
    const candidate = await this.backend.findElement(
      this.windowHandle,
      classNamesForSelector(this.originalSelector),
      this.originalSelector.automationId ?? null,
      this.originalSelector.name ?? null,
      this.originalSelector.role ?? null,
      this.originalSelector.className ?? null,
      this.originalSelector.text ?? null,
      this.originalSelector.matchMode ?? null,
    );
    return candidate !== this.handle;
  }

  public async resolve(): Promise<Element> {
    if (this.originalSelector) {
      const newHandle = await this.backend.findElement(
        this.windowHandle,
        classNamesForSelector(this.originalSelector),
        this.originalSelector.automationId ?? null,
        this.originalSelector.name ?? null,
        this.originalSelector.role ?? null,
        this.originalSelector.className ?? null,
        this.originalSelector.text ?? null,
        this.originalSelector.matchMode ?? null,
      );
      if (newHandle) {
        return new Element(newHandle, this.windowHandle, this.backend, this.events, this.originalSelector);
      }
    }
    return this;
  }

  public async click(): Promise<void> {
    try {
      await this.backend.clickElement(this.handle);
    } catch (err) {
      if (isStaleError(err) && this.originalSelector && await this.tryResolve()) {
        await this.backend.clickElement(this.handle);
      } else if (isStaleError(err)) {
        throw new StaleElementError(
          `Element ${this.handle} is stale and could not be re-resolved`,
          this.handle,
          undefined,
          this.originalSelector,
        );
      } else {
        throw err;
      }
    }
    this.events.emitElementClicked(this.handle);
  }

  public async rightClick(): Promise<void> {
    try {
      await this.backend.rightClickElement(this.handle);
    } catch (err) {
      if (isStaleError(err) && this.originalSelector && await this.tryResolve()) {
        await this.backend.rightClickElement(this.handle);
      } else if (isStaleError(err)) {
        throw new StaleElementError(
          `Element ${this.handle} is stale and could not be re-resolved`,
          this.handle,
          undefined,
          this.originalSelector,
        );
      } else {
        throw err;
      }
    }
    this.events.emitElementRightClicked(this.handle);
  }

  public async doubleClick(): Promise<void> {
    try {
      await this.backend.doubleClickElement(this.handle);
    } catch (err) {
      if (isStaleError(err) && this.originalSelector && await this.tryResolve()) {
        await this.backend.doubleClickElement(this.handle);
      } else if (isStaleError(err)) {
        throw new StaleElementError(
          `Element ${this.handle} is stale and could not be re-resolved`,
          this.handle,
          undefined,
          this.originalSelector,
        );
      } else {
        throw err;
      }
    }
    this.events.emitElementDoubleClicked(this.handle);
  }

  public async hover(): Promise<void> {
    try {
      await this.backend.hoverElement(this.handle);
    } catch (err) {
      if (isStaleError(err) && this.originalSelector && await this.tryResolve()) {
        await this.backend.hoverElement(this.handle);
      } else if (isStaleError(err)) {
        throw new StaleElementError(
          `Element ${this.handle} is stale and could not be re-resolved`,
          this.handle,
          undefined,
          this.originalSelector,
        );
      } else {
        throw err;
      }
    }
    this.events.emitElementHovered(this.handle);
  }

  public async scroll(direction: string, amount: number): Promise<void> {
    await this.backend.scrollElement(this.handle, direction, amount);
  }

  public async dragDrop(target: Element | string): Promise<void> {
    const targetHandle = typeof target === "string" ? target : target.handle;
    await this.backend.dragDrop(this.handle, targetHandle);
  }

  public async dragTo(target: Element | string): Promise<void> {
    return this.dragDrop(target);
  }

  public async typeText(text: string): Promise<void> {
    try {
      await this.backend.typeText(this.handle, text);
    } catch (err) {
      if (isStaleError(err) && this.originalSelector && await this.tryResolve()) {
        await this.backend.typeText(this.handle, text);
      } else if (isStaleError(err)) {
        throw new StaleElementError(
          `Element ${this.handle} is stale and could not be re-resolved`,
          this.handle,
          undefined,
          this.originalSelector,
        );
      } else {
        throw err;
      }
    }
    this.events.emitElementTyped(this.handle, text);
  }

  public async type(text: string): Promise<void> {
    return this.typeText(text);
  }

  public async focus(): Promise<void> {
    await this.backend.focusElement(this.handle);
    this.events.emitDebug("Element focused", { handle: this.handle });
  }

  public async clear(): Promise<void> {
    try {
      // Prefer UIA ValuePattern.SetValue("")
      await this.backend.setValue(this.handle, "");
    } catch {
      // Fallback: select all + replace with empty
      try {
        await this.backend.selectText(this.handle);
        await this.backend.replaceSelectedText(this.handle, "");
      } catch {
        // Last resort: Ctrl+A + Delete
        await this.backend.pressKeyCodes(this.windowHandle, [65]); // Ctrl+A
        await this.backend.pressKeyCodes(this.windowHandle, [46]); // Delete
      }
    }
    this.events.emitDebug("Element cleared", { handle: this.handle });
  }

  public async getText(): Promise<string> {
    try {
      return await this.backend.getText(this.handle);
    } catch (err) {
      if (isStaleError(err) && this.originalSelector && await this.tryResolve()) {
        return this.backend.getText(this.handle);
      }
      if (isStaleError(err)) {
        throw new StaleElementError(
          `Element ${this.handle} is stale and could not be re-resolved`,
          this.handle,
          undefined,
          this.originalSelector,
        );
      }
      throw err;
    }
  }

  public async exists(): Promise<boolean> {
    if (this.originalSelector) {
      const candidate = await this.backend.findElement(
        this.windowHandle,
        classNamesForSelector(this.originalSelector),
        this.originalSelector.automationId ?? null,
        this.originalSelector.name ?? null,
        this.originalSelector.role ?? null,
        this.originalSelector.className ?? null,
        this.originalSelector.text ?? null,
        this.originalSelector.matchMode ?? null,
      );
      return candidate === this.handle;
    }
    const candidate = await this.backend.findElement(this.windowHandle);
    return candidate === this.handle;
  }

  public async getValue(): Promise<string> {
    return this.backend.getValue(this.handle);
  }

  public async setValue(value: string): Promise<void> {
    await this.backend.setValue(this.handle, value);
    this.events.emitElementValueChanged(this.handle, value);
  }

  public async select(): Promise<void> {
    await this.backend.selectElement(this.handle);
    this.events.emitElementSelected(this.handle);
  }

  public async toggle(): Promise<void> {
    await this.backend.toggleElement(this.handle);
    this.events.emitElementToggled(this.handle);
  }

  public async getToggleState(): Promise<string> {
    return this.backend.getToggleState(this.handle);
  }

  public async getParent(): Promise<string | null> {
    return this.backend.getParent(this.handle);
  }

  public async getChildren(): Promise<string[]> {
    return this.backend.getChildren(this.handle);
  }

  public async getSiblings(): Promise<string[]> {
    return this.backend.getSiblings(this.handle);
  }

  public async isVisible(): Promise<boolean> {
    return this.backend.isVisible(this.handle);
  }

  public async isEnabled(): Promise<boolean> {
    return this.backend.isEnabled(this.handle);
  }

  public async isFocused(): Promise<boolean> {
    return this.backend.isFocused(this.handle);
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

  public async keyDown(key: string): Promise<void> {
    await this.backend.keyDown(this.windowHandle, key);
  }

  public async keyUp(key: string): Promise<void> {
    await this.backend.keyUp(this.windowHandle, key);
  }

  public async selectText(): Promise<void> {
    await this.backend.selectText(this.handle);
  }

  public async getSelection(): Promise<string> {
    return this.backend.getSelection(this.handle);
  }

  public async replaceSelectedText(text: string): Promise<void> {
    await this.backend.replaceSelectedText(this.handle, text);
  }

  public async getAttribute(name: string): Promise<string> {
    return this.backend.getElementAttribute(this.handle, name);
  }

  public async getProperty(name: string): Promise<string> {
    return this.getAttribute(name);
  }

  public async highlight(color?: string, durationMs?: number): Promise<void> {
    await this.backend.highlightElement(this.handle, color ?? null, durationMs ?? null);
  }

  /** Build a stable, serializable path from the root window to this element.
   *  The path survives app restarts as long as the UI structure remains stable. */
  public getPath(): ElementPath {
    return this.backend.buildElementPath(this.handle);
  }

  public async waitForVisible(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<this> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (await this.isVisible()) {
        return this;
      }
      await this.backend.waitForUiChange(intervalMs);
    }

    throw new TimeoutError(
      `Element ${this.handle} did not become visible within ${timeoutMs}ms`,
      "waitForVisible",
      timeoutMs,
    );
  }

  public async waitForEnabled(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<this> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (await this.isEnabled()) {
        return this;
      }
      await this.backend.waitForUiChange(intervalMs);
    }

    throw new TimeoutError(
      `Element ${this.handle} did not become enabled within ${timeoutMs}ms`,
      "waitForEnabled",
      timeoutMs,
    );
  }

  public async waitForNotVisible(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<this> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!(await this.isVisible())) {
        return this;
      }
      await this.backend.waitForUiChange(intervalMs);
    }

    throw new TimeoutError(
      `Element ${this.handle} did not become hidden within ${timeoutMs}ms`,
      "waitForNotVisible",
      timeoutMs,
    );
  }

  public async waitForNotEnabled(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<this> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!(await this.isEnabled())) {
        return this;
      }
      await this.backend.waitForUiChange(intervalMs);
    }

    throw new TimeoutError(
      `Element ${this.handle} did not become disabled within ${timeoutMs}ms`,
      "waitForNotEnabled",
      timeoutMs,
    );
  }

  public async waitForRemoved(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<this> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 100;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!(await this.exists())) {
        return this;
      }
      await this.backend.waitForUiChange(intervalMs);
    }

    throw new TimeoutError(
      `Element ${this.handle} was not removed within ${timeoutMs}ms`,
      "waitForRemoved",
      timeoutMs,
    );
  }
}
