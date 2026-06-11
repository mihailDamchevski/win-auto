import { execSync } from "child_process";

/**
 * Check whether the current process is already elevated (admin).
 * Uses a net session test which fails for non-admin tokens.
 */
function isCurrentProcessElevated(): boolean {
  try {
    execSync("net session", { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * `win-auto elevate` — re-launch the CLI with the Windows "runas" verb
 * (triggers UAC prompt). If already elevated, prints a message and exits.
 */
export async function elevateCommand(): Promise<void> {
  if (isCurrentProcessElevated()) {
    process.stdout.write("Already running elevated.\n");
    return;
  }

  process.stdout.write("Requesting elevation (UAC prompt)...\n");

  try {
    execSync(
      `powershell -Command "Start-Process -FilePath '${process.execPath}' -ArgumentList '${process.argv.slice(1).map((s) => s.replace(/'/g, "''")).join("' '")}' -Verb RunAs"`,
      { stdio: "ignore", timeout: 5000 },
    );
    process.stdout.write("Elevated instance launched.\n");
  } catch {
    process.stdout.write("Elevation cancelled or failed.\n");
    process.exitCode = 1;
  }
}
