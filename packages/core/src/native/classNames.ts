import type { ElementSelector } from "../api/types";

const TEXTBOX_CLASS_NAMES = ["Edit", "RichEditD2DPT", "Scintilla"];

export function classNamesForSelector(selector: ElementSelector): string[] | undefined {
  if (selector.role === "textbox") {
    return TEXTBOX_CLASS_NAMES;
  }
  return undefined;
}

export const DEFAULT_NOTEPAD_CLASS_NAMES = TEXTBOX_CLASS_NAMES;
