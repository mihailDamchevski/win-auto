import { Automation } from "../packages/core/src";

async function main(): Promise<void> {
  const automation = new Automation();
  const app = await automation.launch("C:\\Windows\\System32\\notepad.exe");

  // Keep retry/wait logic in JS as requested.
  let element = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    element = await app.find({ role: "textbox" });
    if (element) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!element) {
    throw new Error("Notepad text area was not found.");
  }

  await element.type("hello from real native backend");
}

void main();
