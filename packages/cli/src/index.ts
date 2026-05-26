#!/usr/bin/env node
import { initProject } from "./commands/init";
import { inspectCommand } from "./commands/inspect";
import { Automation, App, Window, Element } from "@win-auto/core";

export { Automation, App, Window, Element, TestAutomation } from "@win-auto/core";

async function runCli(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (command === "init") {
    await initProject(args[0] ?? "");
    return;
  }

  if (command === "inspect") {
    const target = args[0];
    if (!target) {
      process.stderr.write("Usage: win-auto inspect <pid|imageName> [maxDepth] [--hwnd]\n");
      process.exitCode = 1;
      return;
    }
    const maxDepth = args[1] && !args[1].startsWith("--") ? Number(args[1]) : undefined;
    const hwnd = args.includes("--hwnd");
    await inspectCommand(target, maxDepth, hwnd);
    return;
  }

  process.stdout.write("win-auto CLI\n");
  process.stdout.write("Usage:\n");
  process.stdout.write("  win-auto init <project-name>\n");
  process.stdout.write("  win-auto inspect <pid|imageName> [maxDepth] [--hwnd]\n");
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
