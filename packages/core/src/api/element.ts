import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";

export class Element {
  public readonly handle: string;
  private readonly windowHandle: string;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;

  constructor(handle: string, windowHandle: string, backend: Backend, events: AutomationEvents) {
    this.handle = handle;
    this.windowHandle = windowHandle;
    this.backend = backend;
    this.events = events;
  }

  public async click(): Promise<void> {
    await this.backend.clickElement(this.handle);
    this.events.emitElementClicked(this.handle);
  }

  public async rightClick(): Promise<void> {
    await this.backend.rightClickElement(this.handle);
    this.events.emitElementRightClicked(this.handle);
  }

  public async doubleClick(): Promise<void> {
    await this.backend.doubleClickElement(this.handle);
    this.events.emitElementDoubleClicked(this.handle);
  }

  public async hover(): Promise<void> {
    await this.backend.hoverElement(this.handle);
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
    await this.backend.typeText(this.handle, text);
    this.events.emitElementTyped(this.handle, text);
  }

  public async type(text: string): Promise<void> {
    return this.typeText(text);
  }

  public async getText(): Promise<string> {
    return this.backend.getText(this.handle);
  }

  public async exists(): Promise<boolean> {
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
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Element ${this.handle} did not become visible within ${timeoutMs}ms`,
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
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Element ${this.handle} did not become enabled within ${timeoutMs}ms`,
    );
  }
}
