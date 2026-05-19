import type { ElementSelector } from "./types";
import { Element } from "./element";
import { classNamesForSelector } from "../native/classNames";
import { loadNativeBindings } from "../native/loadNative";

export class Window {
  public readonly handle: string;
  public readonly processId: number;

  constructor(handle: string, processId: number) {
    this.handle = handle;
    this.processId = processId;
  }

  public async findElement(selector: ElementSelector): Promise<Element | null> {
    const elementHandle = await loadNativeBindings().findElement(
      this.handle,
      classNamesForSelector(selector),
      selector.automationId,
      selector.name,
      selector.role
    );
    if (!elementHandle) {
      return null;
    }
    return new Element(elementHandle, this.handle);
  }

  public async find(selector: ElementSelector): Promise<Element | null> {
    return this.findElement(selector);
  }

  public async findElements(selector: ElementSelector): Promise<Element[]> {
    const element = await this.findElement(selector);
    return element ? [element] : [];
  }

  public async focus(): Promise<void> {
    // Focus support is intentionally minimal for the initial native backend.
    await Promise.resolve();
  }
}
