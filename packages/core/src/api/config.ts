import path from "path";
import { pathToFileURL } from "url";
import fs from "fs";

export interface WinAutoConfig {
  runtime?: "mock" | "native";
  timeoutMs?: number;
  screenshotOnFailure?: boolean;
}

export async function loadWinAutoConfig(cwd?: string): Promise<WinAutoConfig | null> {
  const projectDir = cwd ?? process.cwd();

  // Try .ts first, then .mjs, .cjs, .js
  const candidates = [
    "win-auto.config.ts",
    "win-auto.config.mjs",
    "win-auto.config.cjs",
    "win-auto.config.js",
  ];
  for (const candidate of candidates) {
    const configPath = path.resolve(projectDir, candidate);
    if (fs.existsSync(configPath)) {
      try {
        const fileUrl = pathToFileURL(configPath).href;
        const mod = await import(fileUrl);
        if (mod?.default) {
          return mod.default as WinAutoConfig;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}
