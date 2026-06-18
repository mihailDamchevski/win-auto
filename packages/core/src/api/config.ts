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
  trace?: boolean;
  inputMode?: "pattern" | "hardware" | "auto";
  retryOnStale?: number;
  debugImages?: boolean;
  debugLocators?: boolean;
  eventLog?: string[];
  pollInterval?: "adaptive" | number;
  appConfig?: AppConfigEntry[];
  /** Flaky test economics: directory for history store (default: .win-auto/flaky) */
  flakyHistoryDir?: string;
  /** Failure rate threshold (0-1) for auto-quarantine (default: 0.3) */
  flakyThreshold?: number;
  /** Minimum runs before quarantine kicks in (default: 5) */
  flakyMinRuns?: number;
  /** Deterministic mode: uses virtual clock for deterministic polling */
  deterministic?: boolean;
  /** Session recording: path to record file */
  recordPath?: string;
  /** Session replay: path to session JSON */
  replayPath?: string;
}

export type ResolvedWinAutoConfig = {
  runtime: "mock" | "native";
  timeoutMs: number;
  screenshotOnFailure: boolean;
  trace: boolean;
  inputMode: "pattern" | "hardware" | "auto";
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
  trace: false,
  inputMode: "auto",
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
    trace: userConfig.trace ?? DEFAULTS.trace,
    inputMode: userConfig.inputMode ?? DEFAULTS.inputMode,
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
    if (!fs.existsSync(configPath)) continue;

    if (candidate.endsWith(".ts")) {
      const result = await loadTsConfig(configPath);
      if (result) return result;
    } else {
      try {
        const fileUrl = pathToFileURL(configPath).href;
        const mod = await import(fileUrl);
        if (mod?.default) return mod.default as WinAutoConfig;
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function loadTsConfig(configPath: string): Promise<WinAutoConfig | null> {
  const fileUrl = pathToFileURL(configPath).href;

  try {
    const mod = await import(fileUrl);
    if (mod?.default) return mod.default as WinAutoConfig;
  } catch {
    /* fall through to loader registration */
  }

  for (const loader of ["tsx", "ts-node/esm"]) {
    try {
      await import(loader);
      const mod = await import(fileUrl);
      if (mod?.default) return mod.default as WinAutoConfig;
    } catch {
      /* try next loader */
    }
  }

  console.warn(
    `[win-auto] Found "${path.basename(configPath)}" but could not load it.\n` +
      "TypeScript config files require 'tsx' or 'ts-node':\n" +
      "  npm install tsx --save-dev\n" +
      "Alternatively, rename to win-auto.config.mjs / .cjs / .js",
  );
  return null;
}


