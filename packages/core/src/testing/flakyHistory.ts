import fs from "fs";
import path from "path";

export type FailureMode = "timeout" | "assertion" | "crash" | "other";

export type FlakyRecord = {
  testName: string;
  timestamp: number;
  durationMs: number;
  passed: boolean;
  failureMode?: FailureMode;
  errorMessage?: string;
  envFingerprint: string;
  ci: boolean;
};

export type FlakySummary = {
  testName: string;
  totalRuns: number;
  failures: number;
  failureRate: number;
  lastRun: number;
  lastDurationMs: number;
  recentFailureRate: number;
  quarantined: boolean;
  failureModes: Record<string, number>;
};

export type FlakyCluster = {
  label: string;
  tests: string[];
  count: number;
  sampleMessage: string;
};

export type FlakyReport = {
  generatedAt: string;
  totalRuns: number;
  totalTests: number;
  quarantinedTests: number;
  summaries: FlakySummary[];
  clusters: FlakyCluster[];
};

function getEnvFingerprint(): string {
  const os = typeof process !== "undefined" ? process.platform : "unknown";
  const node = typeof process !== "undefined" ? process.version : "unknown";
  const arch = typeof process !== "undefined" ? process.arch : "unknown";
  return `${os}-${node}-${arch}`;
}

function normalizeError(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/\d+/g, "0")
    .replace(/0x[0-9a-f]+/g, "0x0")
    .replace(/pid \d+/g, "pid 0")
    .replace(/[<>"'/\\]/g, "")
    .trim();
}

function wordJaccard(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

export class FlakyHistoryStore {
  private filePath: string;
  private records: FlakyRecord[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dir?: string) {
    const historyDir = dir ?? ".win-auto/flaky";
    this.filePath = path.resolve(historyDir, "history.json");
    this.load();
  }

  get filepath(): string {
    return this.filePath;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.records = JSON.parse(raw) as FlakyRecord[];
      }
    } catch {
      this.records = [];
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2), "utf-8");
      this.dirty = false;
    } catch {
      // best-effort persistence
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 500);
  }

  record(testName: string, passed: boolean, durationMs: number, error?: Error): void {
    let failureMode: FailureMode | undefined;
    let errorMessage: string | undefined;

    if (!passed && error) {
      const msg = error.message ?? "";
      if (msg.includes("timeout") || error.name === "TimeoutError") {
        failureMode = "timeout";
      } else if (msg.includes("expect") || msg.includes("assert") || error.name === "AssertionError") {
        failureMode = "assertion";
      } else if (
        error.name === "Error" ||
        error.name === "TypeError" ||
        error.name === "ReferenceError"
      ) {
        failureMode = "crash";
      } else {
        failureMode = "other";
      }
      errorMessage = msg;
    }

    this.records.push({
      testName,
      timestamp: Date.now(),
      durationMs,
      passed,
      failureMode,
      errorMessage,
      envFingerprint: getEnvFingerprint(),
      ci: Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
    });

    // Keep last 1000 records per test to bound file size
    this.trim();
    this.scheduleSave();
  }

  private trim(): void {
    const grouped = new Map<string, FlakyRecord[]>();
    for (const r of this.records) {
      const arr = grouped.get(r.testName) ?? [];
      arr.push(r);
      grouped.set(r.testName, arr);
    }
    const trimmed: FlakyRecord[] = [];
    const MAX_PER_TEST = 1000;
    for (const [, arr] of grouped) {
      if (arr.length > MAX_PER_TEST) {
        arr.sort((a, b) => a.timestamp - b.timestamp);
        trimmed.push(...arr.slice(arr.length - MAX_PER_TEST));
      } else {
        trimmed.push(...arr);
      }
    }
    this.records = trimmed;
  }

  getFailureRate(testName: string, windowMs?: number): number {
    const relevant = this.getRecords(testName, windowMs);
    if (relevant.length === 0) return 0;
    const failures = relevant.filter((r) => !r.passed).length;
    return failures / relevant.length;
  }

  getRecentFailureRate(testName: string): number {
    return this.getFailureRate(testName, 7 * 24 * 60 * 60 * 1000);
  }

  getRecords(testName: string, windowMs?: number): FlakyRecord[] {
    let relevant = this.records.filter((r) => r.testName === testName);
    if (windowMs !== undefined) {
      const cutoff = Date.now() - windowMs;
      relevant = relevant.filter((r) => r.timestamp >= cutoff);
    }
    return relevant;
  }

  getAllTestNames(): string[] {
    return [...new Set(this.records.map((r) => r.testName))];
  }

  getSummary(testName: string): FlakySummary {
    const all = this.getRecords(testName);
    const recent = this.getRecords(testName, 7 * 24 * 60 * 60 * 1000);
    const failures = all.filter((r) => !r.passed);
    const recentFailures = recent.filter((r) => !r.passed);

    const failureModes: Record<string, number> = {};
    for (const f of failures) {
      const mode = f.failureMode ?? "other";
      failureModes[mode] = (failureModes[mode] ?? 0) + 1;
    }

    const last = all[all.length - 1];
    return {
      testName,
      totalRuns: all.length,
      failures: failures.length,
      failureRate: all.length > 0 ? failures.length / all.length : 0,
      lastRun: last?.timestamp ?? 0,
      lastDurationMs: last?.durationMs ?? 0,
      recentFailureRate: recent.length > 0 ? recentFailures.length / recent.length : 0,
      quarantined: false,
      failureModes,
    };
  }

  getAllSummaries(): FlakySummary[] {
    const names = this.getAllTestNames();
    return names.map((n) => this.getSummary(n));
  }

  /**
   * Cluster failures by normalized error message similarity.
   * Groups records whose error messages have a Jaccard similarity > 0.3.
   */
  clusterFailures(): FlakyCluster[] {
    const failures = this.records.filter(
      (r) => !r.passed && r.errorMessage,
    );
    if (failures.length === 0) return [];

    // Deduplicate error messages per test
    const errorSet = new Map<string, string[]>();
    for (const f of failures) {
      const key = `${f.testName}::${normalizeError(f.errorMessage!)}`;
      if (!errorSet.has(key)) {
        errorSet.set(key, [f.errorMessage!]);
      }
    }

    const errorEntries = [...errorSet.entries()].map(([key, msgs]) => ({
      key,
      testName: key.split("::")[0]!,
      normalized: normalizeError(msgs[0]!),
      sampleMessage: msgs[0]!,
    }));

    if (errorEntries.length === 0) return [];

    // Greedy clustering
    const clusters: Array<{
      tests: Set<string>;
      messages: string[];
      sampleMessage: string;
    }> = [];
    const assigned = new Set<string>();

    for (const entry of errorEntries) {
      if (assigned.has(entry.key)) continue;

      const cluster = {
        tests: new Set([entry.testName]),
        messages: [entry.normalized],
        sampleMessage: entry.sampleMessage,
      };
      assigned.add(entry.key);

      for (const other of errorEntries) {
        if (assigned.has(other.key)) continue;
        for (const msg of cluster.messages) {
          if (wordJaccard(msg, other.normalized) > 0.3) {
            cluster.tests.add(other.testName);
            cluster.messages.push(other.normalized);
            assigned.add(other.key);
            break;
          }
        }
      }

      clusters.push(cluster);
    }

    return clusters
      .sort((a, b) => b.tests.size - a.tests.size)
      .map((c) => ({
        label: c.messages[0]!.substring(0, 80),
        tests: [...c.tests].sort(),
        count: c.tests.size,
        sampleMessage: c.sampleMessage.substring(0, 200),
      }));
  }

  generateReport(threshold?: number): FlakyReport {
    const summaries = this.getAllSummaries();
    const activeThreshold = threshold ?? 0.3;
    const quarantined = summaries.filter((s) => s.recentFailureRate >= activeThreshold);

    return {
      generatedAt: new Date().toISOString(),
      totalRuns: this.records.length,
      totalTests: summaries.length,
      quarantinedTests: quarantined.length,
      summaries: summaries.sort((a, b) => b.recentFailureRate - a.recentFailureRate),
      clusters: this.clusterFailures(),
    };
  }
}
