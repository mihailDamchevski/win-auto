import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";
import type { ElementSelector, WindowBounds } from "./types";
import { Element } from "./element";
import { classNamesForSelector } from "../native/classNames";

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

  public async findElement(selector: ElementSelector): Promise<Element | null> {
    const elementHandle = await this.backend.findElement(
      this.handle,
      classNamesForSelector(selector),
      selector.automationId,
      selector.name,
      selector.role,
    );
    if (!elementHandle) {
      return null;
    }
    this.events.emitElementFound(elementHandle, selector as Record<string, unknown>);
    return new Element(elementHandle, this.handle, this.backend, this.events);
  }

  public async find(selector: ElementSelector): Promise<Element | null> {
    return this.findElement(selector);
  }

  public async findElements(selector: ElementSelector): Promise<Element[]> {
    const element = await this.findElement(selector);
    return element ? [element] : [];
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

  public async focus(): Promise<void> {
    await Promise.resolve();
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
}
