import path from "path";
import { pathToFileURL } from "url";
import fs from "fs";

export type AppConfigEntry = {
  match: string;
  inputMode?: "pattern" | "hardware" | "auto";
  classNames?: string[];
  dpiMode?: "system" | "per-monitor" | "unaware";
  timeoutMs?: number;
};

export interface WinAutoConfig {
  runtime?: "mock" | "native";
  timeoutMs?: number;
  screenshotOnFailure?: boolean;
  inputMode?: "pattern" | "hardware" | "auto";
  dpiScale?: number;
  retryOnStale?: number;
  debugImages?: boolean;
  debugLocators?: boolean;
  eventLog?: string[];
  pollInterval?: "adaptive" | number;
  appConfig?: AppConfigEntry[];
}

export type ResolvedWinAutoConfig = {
  runtime: "mock" | "native";
  timeoutMs: number;
  screenshotOnFailure: boolean;
  inputMode: "pattern" | "hardware" | "auto";
  dpiScale: number;
  retryOnStale: number;
  debugImages: boolean;
  debugLocators: boolean;
  eventLog: string[];
  pollInterval: "adaptive" | number;
  appConfig: AppConfigEntry[];
};

const DEFAULTS: ResolvedWinAutoConfig = {
  runtime: "native",
  timeoutMs: 10_000,
  screenshotOnFailure: false,
  inputMode: "auto",
  dpiScale: 1.0,
  retryOnStale: 2,
  debugImages: false,
  debugLocators: false,
  eventLog: [],
  pollInterval: 100,
  appConfig: [],
};

export function resolveConfig(userConfig?: WinAutoConfig | null): ResolvedWinAutoConfig {
  if (!userConfig) return { ...DEFAULTS };

  return {
    runtime: userConfig.runtime ?? DEFAULTS.runtime,
    timeoutMs: userConfig.timeoutMs ?? DEFAULTS.timeoutMs,
    screenshotOnFailure: userConfig.screenshotOnFailure ?? DEFAULTS.screenshotOnFailure,
    inputMode: userConfig.inputMode ?? DEFAULTS.inputMode,
    dpiScale: userConfig.dpiScale ?? DEFAULTS.dpiScale,
    retryOnStale: userConfig.retryOnStale ?? DEFAULTS.retryOnStale,
    debugImages: userConfig.debugImages ?? DEFAULTS.debugImages,
    debugLocators: userConfig.debugLocators ?? DEFAULTS.debugLocators,
    eventLog: userConfig.eventLog ?? DEFAULTS.eventLog,
    pollInterval: userConfig.pollInterval ?? DEFAULTS.pollInterval,
    appConfig: userConfig.appConfig ?? DEFAULTS.appConfig,
  };
}

export async function loadWinAutoConfig(cwd?: string): Promise<WinAutoConfig | null> {
  const projectDir = cwd ?? process.cwd();

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


