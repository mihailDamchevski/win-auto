import { Automation } from "@win-auto/core";
import fs from "fs";

export type RecordOptions = {
  pid: number;
  output?: string;
  durationMs?: number;
};

export async function recordCommand(options: RecordOptions): Promise<void> {
  const { pid } = options;
  const outputPath = options.output ?? `session-${pid}-${Date.now()}.json`;
  const durationMs = options.durationMs ?? 30_000;

  const automation = new Automation();
  const recorder = automation.recorder;

  if (!recorder) {
    process.stderr.write("Error: SessionRecorder not available\n");
    process.exitCode = 1;
    return;
  }

  // Attach recorder to events
  const detach = recorder.attach(automation.events);
  recorder.start();

  process.stdout.write(`Recording session for PID ${pid}...\n`);
  process.stdout.write(`  Output: ${outputPath}\n`);
  process.stdout.write(`  Duration: ${durationMs}ms\n`);
  process.stdout.write("Press Ctrl+C to stop early.\n\n");

  // Log the target — on Windows we'd connect via connectApp, but for
  // cross-platform CLI we just record events at the automation level.
  process.stdout.write(`Target PID: ${pid} (recording automation-level events)\n`);

  // Record for the specified duration
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), durationMs);

    // Allow early termination on SIGINT
    process.on("SIGINT", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  // Stop recording and save
  const session = recorder.stop();
  detach();

  const json = JSON.stringify(session, null, 2);
  fs.writeFileSync(outputPath, json, "utf-8");

  process.stdout.write(`\nSession recorded: ${session.actions.length} actions, ${session.frames.length} frames\n`);
  process.stdout.write(`Saved to ${outputPath}\n`);
}
