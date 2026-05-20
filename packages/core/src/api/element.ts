import { loadNativeBindings } from "../native/loadNative";

export class Element {
  public readonly handle: string;
  private readonly windowHandle: string;

  constructor(handle: string, windowHandle: string) {
    this.handle = handle;
    this.windowHandle = windowHandle;
  }

  public async click(): Promise<void> {
    await Promise.resolve();
  }

  public async typeText(text: string): Promise<void> {
    await loadNativeBindings().typeText(this.handle, text);
  }

  public async type(text: string): Promise<void> {
    return this.typeText(text);
  }

  public async getText(): Promise<string> {
    return loadNativeBindings().getText(this.handle);
  }

  public async exists(): Promise<boolean> {
    const candidate = await loadNativeBindings().findElement(this.windowHandle);
    return candidate === this.handle;
  }
}
