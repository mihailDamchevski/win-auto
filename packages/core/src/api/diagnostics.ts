import os from "os";
import process from "process";
import { execSync } from "child_process";
import fs from "fs";
import type { Backend } from "./backend";
import type { NativeBindings } from "./types";

export type OsInfo = {
  version: string;
  edition: string;
  build: string;
};

export type DisplayInfo = {
  width: number;
  height: number;
  dpi: number;
  scale: number;
};

export type UiaInfo = {
  available: boolean;
  version: string;
};

export type NativeInfo = {
  version: string;
  functions: string[];
};

export type ProcessInfoSummary = {
  total: number;
  elevated: number;
};

export type DiagnosticsReport = {
  os: OsInfo;
  displays: DisplayInfo[];
  uia: UiaInfo;
  native: NativeInfo;
  processes: ProcessInfoSummary;
};

function getOsInfo(): OsInfo {
  const release = os.release();
  const parts = release.split(".");
  const build = parts.length >= 3 ? parts[2] : "0";
  let edition = "Unknown";
  try {
    const output = execSync(
      'powershell -NoProfile -Command "(Get-WmiObject Win32_OperatingSystem).Caption"',
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    const match = output.match(/Windows\s+\S+\s+(\S+)/i);
    if (match) edition = match[1];
  } catch {
    edition = "Unknown";
  }
  return {
    version: `${parts[0]}.${parts[1]}.${build}`,
    edition,
    build,
  };
}

function getDisplayInfo(): DisplayInfo[] {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "Get-WmiObject Win32_DesktopMonitor | Select-Object ScreenWidth,ScreenHeight | ConvertTo-Json"',
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    const parsed = JSON.parse(output);
    const monitors = Array.isArray(parsed) ? parsed : [parsed];
    return monitors
      .filter((m: { ScreenWidth?: number; ScreenHeight?: number }) => m.ScreenWidth && m.ScreenHeight)
      .map((m: { ScreenWidth?: number; ScreenHeight?: number }) => ({
        width: m.ScreenWidth!,
        height: m.ScreenHeight!,
        dpi: 96,
        scale: 1.0,
      }));
  } catch {
    return [{ width: 0, height: 0, dpi: 96, scale: 1.0 }];
  }
}

function getUiaInfo(): UiaInfo {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "[System.Windows.Automation.Automation]::IsAvailable; [System.Windows.Automation.Automation]::Version"',
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    const lines = output.split("\n").map((l) => l.trim());
    return {
      available: lines[0]?.toLowerCase() === "true",
      version: lines[1] ?? "",
    };
  } catch {
    return { available: false, version: "" };
  }
}

function getNativeInfo(nativeBindings?: NativeBindings): NativeInfo {
  const version = nativeBindings
    ? (nativeBindings as unknown as { version?: string }).version ?? "0.1.0"
    : "not loaded";
  const functions: string[] = [];
  if (nativeBindings) {
    for (const key of Object.keys(nativeBindings) as (keyof NativeBindings)[]) {
      if (typeof nativeBindings[key] === "function") {
        functions.push(key);
      }
    }
  }
  return { version, functions };
}

function getProcessSummary(backend: Backend): ProcessInfoSummary {
  let total: number;
  try {
    const output = execSync(
      'powershell -NoProfile -Command "(Get-Process | Where-Object { $_.SI -ne 0 }).Count"',
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    total = Number(output) || 0;
  } catch {
    total = 0;
  }

  let elevated = 0;
  try {
    if (backend.isProcessElevated(process.pid)) {
      elevated = 1;
    }
  } catch {
    // native backend may not support isProcessElevated
  }

  return { total, elevated };
}

export class Diagnostics {
  private readonly backend: Backend;
  private nativeBindings?: NativeBindings;

  constructor(backend: Backend, nativeBindings?: NativeBindings) {
    this.backend = backend;
    this.nativeBindings = nativeBindings;
  }

  async collect(): Promise<DiagnosticsReport> {
    const [osInfo, displays, uia, native, processes] = await Promise.all([
      Promise.resolve(getOsInfo()),
      Promise.resolve(getDisplayInfo()),
      Promise.resolve(getUiaInfo()),
      Promise.resolve(getNativeInfo(this.nativeBindings)),
      Promise.resolve(getProcessSummary(this.backend)),
    ]);

    return {
      os: osInfo,
      displays,
      uia,
      native,
      processes,
    };
  }

  async export(filePath: string): Promise<void> {
    const report = await this.collect();
    const json = JSON.stringify(report, null, 2);
    fs.writeFileSync(filePath, json, "utf8");
  }
}
