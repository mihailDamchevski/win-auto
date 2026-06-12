#!/usr/bin/env node
import { initProject } from "./commands/init";
import { inspectCommand } from "./commands/inspect";
import { queryCommand } from "./commands/query";
import { elevateCommand } from "./commands/elevate";
import { diagnoseCommand } from "./commands/diagnose";
import { Automation, App, Window, Element } from "@win-auto/core";

export { Automation, App, Window, Element, TestAutomation } from "@win-auto/core";

async function runCli(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (command === "elevate") {
    await elevateCommand();
    return;
  }

  if (command === "init") {
    await initProject(args[0] ?? "");
    return;
  }

  if (command === "inspect") {
    const target = args[0];
    if (!target) {
      process.stderr.write(
        "Usage: win-auto inspect <pid|imageName> [maxDepth] [--hwnd] [--highlight <name>]\n",
      );
      process.exitCode = 1;
      return;
    }
    const maxDepth = args[1] && !args[1].startsWith("--") ? Number(args[1]) : undefined;
    const hwnd = args.includes("--hwnd");
    const highlightIdx = args.indexOf("--highlight");
    const highlight =
      highlightIdx >= 0 && highlightIdx + 1 < args.length ? args[highlightIdx + 1] : undefined;
    await inspectCommand(target, maxDepth, hwnd, highlight);
    return;
  }

  if (command === "query") {
    const target = args[0];
    if (!target) {
      process.stderr.write("Usage: win-auto query <pid|imageName> [options]\n");
      process.stderr.write("Options:\n");
      process.stderr.write("  --name <name>          Filter by element name\n");
      process.stderr.write("  --role <role>          Filter by element role\n");
      process.stderr.write("  --automation-id <id>   Filter by automation ID\n");
      process.stderr.write("  --class-name <name>    Filter by class name\n");
      process.stderr.write("  --text <text>          Filter by element text\n");
      process.stderr.write("  --mode <mode>          Match mode: substring, exact, regex\n");
      process.stderr.write("  --all                  Find all matches (not just first)\n");
      process.stderr.write("  --hwnd                 Use HWND tree instead of UIA\n");
      process.stderr.write("  --highlight            Highlight matched element(s)\n");
      process.exitCode = 1;
      return;
    }
    const nameIdx = args.indexOf("--name");
    const roleIdx = args.indexOf("--role");
    const autoIdx = args.indexOf("--automation-id");
    const classIdx = args.indexOf("--class-name");
    const textIdx = args.indexOf("--text");
    const modeIdx = args.indexOf("--mode");
    await queryCommand(target, {
      name: nameIdx >= 0 && nameIdx + 1 < args.length ? args[nameIdx + 1] : undefined,
      role: roleIdx >= 0 && roleIdx + 1 < args.length ? args[roleIdx + 1] : undefined,
      automationId: autoIdx >= 0 && autoIdx + 1 < args.length ? args[autoIdx + 1] : undefined,
      className: classIdx >= 0 && classIdx + 1 < args.length ? args[classIdx + 1] : undefined,
      text: textIdx >= 0 && textIdx + 1 < args.length ? args[textIdx + 1] : undefined,
      matchMode: modeIdx >= 0 && modeIdx + 1 < args.length ? args[modeIdx + 1] : undefined,
      findAll: args.includes("--all"),
      hwnd: args.includes("--hwnd"),
      highlight: args.includes("--highlight"),
    });
    return;
  }

  if (command === "diagnose") {
    const pidIdx = args.indexOf("--pid");
    const nameIdx = args.indexOf("--name");
    const outputIdx = args.indexOf("--output");
    await diagnoseCommand({
      pid: pidIdx >= 0 && pidIdx + 1 < args.length ? Number(args[pidIdx + 1]) : undefined,
      name: nameIdx >= 0 && nameIdx + 1 < args.length ? args[nameIdx + 1] : undefined,
      tree: args.includes("--tree"),
      hwnd: args.includes("--hwnd"),
      uia: args.includes("--uia"),
      events: args.includes("--events"),
      recommend: args.includes("--recommend"),
      output: outputIdx >= 0 && outputIdx + 1 < args.length ? args[outputIdx + 1] : undefined,
    });
    return;
  }

  process.stdout.write("win-auto CLI\n");
  process.stdout.write("Usage:\n");
  process.stdout.write("  win-auto init <project-name>\n");
  process.stdout.write(
    "  win-auto inspect <pid|imageName> [maxDepth] [--hwnd] [--highlight <name>]\n",
  );
  process.stdout.write(
    "  win-auto query <pid|imageName> [--name <name>] [--role <role>] [--all] [--highlight]\n",
  );
  process.stdout.write("  win-auto diagnose [--pid <pid>] [--name <name>] [--tree] [--hwnd]\n");
  process.stdout.write("                 [--uia] [--events] [--recommend] [--output <file>]\n");
  process.stdout.write("  win-auto elevate\n");
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
