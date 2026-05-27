import type { Backend } from "./backend";
import type { AutomationEvents } from "./events";
import type { DialogControl, DialogInfo, ElementSelector } from "./types";
import { Element } from "./element";

export class Dialog {
  public readonly handle: string;
  public readonly title: string;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;

  constructor(info: DialogInfo, backend: Backend, events: AutomationEvents) {
    this.handle = info.handle;
    this.title = info.title;
    this.backend = backend;
    this.events = events;
  }

  public async getControls(): Promise<DialogControl[]> {
    return this.backend.getDialogControls(this.handle);
  }

  public async clickButton(buttonText: string): Promise<void> {
    this.events.emitDebug(`Clicking dialog button "${buttonText}"`, { dialog: this.handle });
    await this.backend.clickDialogButton(this.handle, buttonText);
    this.events.emitDialogButtonClicked(this.handle, buttonText);
  }

  public async accept(): Promise<void> {
    await this.clickButton("OK");
  }

  public async dismiss(): Promise<void> {
    await this.clickButton("Cancel");
  }

  public async pressKey(keyCombination: string): Promise<void> {
    await this.backend.pressKey(this.handle, keyCombination);
  }

  public async typeText(text: string): Promise<void> {
    this.events.emitDebug(`Typing text into dialog: "${text}"`, { dialog: this.handle });
    await this.backend.sendKeys(this.handle, text);
  }

  public async selectFile(path: string): Promise<void> {
    this.events.emitDebug(`Setting file path in dialog: ${path}`, { dialog: this.handle });
    await this.backend.setDialogFilePath(this.handle, path);
    this.events.emitDialogFileSelected(this.handle, path);
  }

  public async findElement(selector: ElementSelector): Promise<Element | null> {
    const found = await this.backend.findElement(
      this.handle,
      null,
      selector.automationId ?? null,
      selector.name ?? null,
      selector.role ?? null,
      selector.className ?? null,
      selector.text ?? null,
      selector.matchMode ?? null,
    );
    if (!found) return null;
    return new Element(found, this.handle, this.backend, this.events, selector);
  }
}

export class DialogManager {
  private readonly processId: number;
  private readonly backend: Backend;
  private readonly events: AutomationEvents;

  constructor(processId: number, backend: Backend, events: AutomationEvents) {
    this.processId = processId;
    this.backend = backend;
    this.events = events;
  }

  public list(): Dialog[] {
    const infos = this.backend.findDialogs(this.processId);
    return infos.map((info) => new Dialog(info, this.backend, this.events));
  }

  public find(title?: string): Dialog | null {
    const dialogs = this.list();
    if (!title) {
      return dialogs[0] ?? null;
    }
    const query = title.toLocaleLowerCase();
    return dialogs.find(
      (d) =>
        d.title.toLocaleLowerCase().includes(query) ||
        query.includes(d.title.toLocaleLowerCase()),
    ) ?? null;
  }

  public async waitFor(options?: {
    title?: string;
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<Dialog> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const intervalMs = options?.intervalMs ?? 200;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const dialog = this.find(options?.title);
      if (dialog) {
        this.events.emitDialogFound(dialog.handle, dialog.title);
        this.events.emitDebug("Dialog found", {
          title: dialog.title,
          handle: dialog.handle,
        });
        return dialog;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `No dialog${options?.title ? ` with title "${options.title}"` : ""} found within ${timeoutMs}ms`,
    );
  }
}
