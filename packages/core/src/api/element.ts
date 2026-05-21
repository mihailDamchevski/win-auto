import type { Backend } from "./backend";

export class Element {
  public readonly handle: string;
  private readonly windowHandle: string;
  private readonly backend: Backend;

  constructor(handle: string, windowHandle: string, backend: Backend) {
    this.handle = handle;
    this.windowHandle = windowHandle;
    this.backend = backend;
  }

  public async click(): Promise<void> {
    await this.backend.clickElement(this.handle);
  }

  public async typeText(text: string): Promise<void> {
    await this.backend.typeText(this.handle, text);
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
  }

  public async select(): Promise<void> {
    await this.backend.selectElement(this.handle);
  }

  public async toggle(): Promise<void> {
    await this.backend.toggleElement(this.handle);
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
}
