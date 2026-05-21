import type { Backend } from "./backend";
import type { ProcessEntry } from "./types";

export class ProcessInfo {
  public readonly pid: number;
  public readonly imageName: string;

  constructor(entry: ProcessEntry) {
    this.pid = entry.pid;
    this.imageName = entry.imageName;
  }

  public async getImagePath(backend: Backend): Promise<string> {
    return backend.getProcessImageName(this.pid);
  }

  public async isRunning(backend: Backend): Promise<boolean> {
    return backend.isProcessRunning(this.pid);
  }

  public async waitForExit(backend: Backend, timeoutMs?: number): Promise<boolean> {
    return backend.waitForProcessExit(this.pid, timeoutMs ?? 30_000);
  }

  public async kill(backend: Backend): Promise<void> {
    await backend.killProcess(this.pid);
  }
}

export class ProcessManager {
  private readonly backend: Backend;

  constructor(backend: Backend) {
    this.backend = backend;
  }

  public findByName(imageName: string): ProcessInfo[] {
    const entries = this.backend.findProcessesByName(imageName);
    return entries.map((e) => new ProcessInfo(e));
  }

  public findByPid(pid: number): ProcessInfo | null {
    const entries = this.backend.findProcessesByName("");
    const match = entries.find((e) => e.pid === pid);
    return match ? new ProcessInfo(match) : null;
  }
}
