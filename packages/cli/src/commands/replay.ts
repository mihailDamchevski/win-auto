import fs from "fs";
import { SessionReplayer } from "@win-auto/core";
import { MockBackend } from "@win-auto/core";

export type ReplayOptions = {
  input: string;
  speed?: number;
  verbose?: boolean;
};

export async function replayCommand(options: ReplayOptions): Promise<void> {
  const inputPath = options.input;
  const speed = options.speed ?? 1;
  const verbose = options.verbose ?? false;

  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`Error: Session file not found: ${inputPath}\n`);
    process.exitCode = 1;
    return;
  }

  // Load session
  const json = fs.readFileSync(inputPath, "utf-8");
  let session;
  try {
    session = SessionReplayer.fromJSONString(json);
  } catch (err) {
    process.stderr.write(`Error parsing session file: ${err}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Replaying session from ${inputPath}...\n`);
  process.stdout.write(`  Actions: ${session.actions.length}\n`);
  process.stdout.write(`  Frames: ${session.frames.length}\n`);
  process.stdout.write(`  Speed: ${speed}x\n`);

  // Create mock backend and replayer
  const mockBackend = new MockBackend();
  const replayer = new SessionReplayer(mockBackend);

  process.stdout.write("\nReplaying...\n");

  const result = await replayer.replay(session, mockBackend, speed);

  // Report results
  process.stdout.write("\n=== Replay Results ===\n");
  process.stdout.write(`  Status: ${result.success ? "PASSED" : "FAILED"}\n`);
  process.stdout.write(`  Steps: ${result.stepsReplayed}/${result.totalSteps} completed\n`);
  process.stdout.write(`  Duration: ${result.durationMs}ms (virtual time)\n`);

  if (result.errors.length > 0) {
    process.stdout.write(`\n  Errors (${result.errors.length}):\n`);
    for (const err of result.errors) {
      process.stdout.write(`    [Step ${err.step}] ${err.action}: ${err.error}\n`);
    }
  }

  if (verbose && mockBackend) {
    const events = mockBackend.events.all();
    process.stdout.write(`\n  Mock events: ${events.length}\n`);
  }

  if (!result.success) {
    process.exitCode = 1;
  }
}
