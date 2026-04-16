#!/usr/bin/env node
import { initProject } from "./commands/init";
import { Automation, App, Window, Element } from "@win-auto/core";

export { Automation, App, Window, Element };

async function runCli(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (command === "init") {
    await initProject(args[0] ?? "");
    return;
  }

  process.stdout.write("win-auto CLI\n");
  process.stdout.write("Usage:\n");
  process.stdout.write("  win-auto init <project-name>\n");
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
