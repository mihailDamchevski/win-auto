import path from "path";
import { FlakyHistoryStore } from "@win-auto/core";

function printSection(title: string): void {
  process.stdout.write(`\n${"=".repeat(60)}\n`);
  process.stdout.write(`  ${title}\n`);
  process.stdout.write(`${"=".repeat(60)}\n`);
}

function printKV(key: string, value: unknown): void {
  process.stdout.write(`  ${key.padEnd(30)} ${value}\n`);
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export type TestReportOptions = {
  historyDir?: string;
  threshold?: number;
  top?: number;
};

export function testReportCommand(options: TestReportOptions): void {
  const dir = options.historyDir ?? ".win-auto/flaky";
  const store = new FlakyHistoryStore(dir);
  const report = store.generateReport(options.threshold ?? 0.3);
  const topN = options.top ?? 20;

  printSection("Flaky Test Report");
  printKV("Generated", report.generatedAt);
  printKV("Total Runs", String(report.totalRuns));
  printKV("Total Tests", String(report.totalTests));
  printKV("Quarantined", String(report.quarantinedTests));
  printKV("History File", path.resolve(dir, "history.json"));

  // ── Flakiest tests ──
  printSection(`Top ${Math.min(topN, report.summaries.length)} Flakiest Tests`);
  if (report.summaries.length === 0) {
    process.stdout.write("  (no test history found)\n");
  } else {
    process.stdout.write(
      `  ${"Test".padEnd(48)} ${"Runs".padStart(5)} ${"Fail".padStart(5)} ${"Rate".padStart(7)} ${"Recent Rate".padStart(12)} ${"Status".padStart(10)}\n`,
    );
    process.stdout.write(`  ${"─".repeat(48)}  ${"─".repeat(4)}  ${"─".repeat(4)}  ${"─".repeat(6)}  ${"─".repeat(11)}  ${"─".repeat(9)}\n`);

    for (const s of report.summaries.slice(0, topN)) {
      const name = s.testName.length > 47 ? s.testName.substring(0, 44) + "..." : s.testName;
      const isQuarantined = s.recentFailureRate >= (options.threshold ?? 0.3);
      const status = isQuarantined ? "{red-fg}QUARANTINED{/red-fg}" : "{green-fg}OK{/green-fg}";
      process.stdout.write(
        `  ${name.padEnd(48)} ${String(s.totalRuns).padStart(5)} ${String(s.failures).padStart(5)} ${pct(s.failureRate).padStart(7)} ${pct(s.recentFailureRate).padStart(12)} ${status.padStart(10)}\n`,
      );
    }
  }

  // ── Failure mode breakdown ──
  const totalFailures = report.summaries.reduce((sum: number, t: { failures: number }) => sum + t.failures, 0);
  if (totalFailures > 0) {
    printSection("Failure Mode Breakdown");
    const modeCounts: Record<string, number> = {};
    for (const s of report.summaries) {
      const modes = s.failureModes as Record<string, number>;
      for (const [mode, count] of Object.entries(modes)) {
        modeCounts[mode] = (modeCounts[mode] ?? 0) + Number(count);
      }
    }
    const sorted = Object.entries(modeCounts).sort((a, b) => b[1] - a[1]);
    for (const [mode, count] of sorted) {
      printKV(`${mode}`, `${count} (${((Number(count) / totalFailures) * 100).toFixed(1)}%)`);
    }
  }

  // ── Failure clusters ──
  if (report.clusters.length > 0) {
    printSection("Failure Clusters");
    process.stdout.write(`  ${"Cluster".padEnd(50)} ${"Tests".padStart(6)}\n`);
    process.stdout.write(`  ${"─".repeat(50)} ${"─".repeat(5)}\n`);
    for (const c of report.clusters.slice(0, 10)) {
      const label = c.label.length > 49 ? c.label.substring(0, 46) + "..." : c.label;
      process.stdout.write(`  ${label.padEnd(50)} ${String(c.count).padStart(6)}\n`);
    }
    if (report.clusters.length > 10) {
      process.stdout.write(`  ... and ${report.clusters.length - 10} more clusters\n`);
    }

    printSection("Top Cluster Details");
    const top = report.clusters[0]!;
    process.stdout.write(`  Label: ${top.label}\n`);
    process.stdout.write(`  Tests: ${top.tests.join(", ")}\n`);
    process.stdout.write(`  Sample error:\n`);
    process.stdout.write(`    ${top.sampleMessage}\n`);
  }

  // ── Quarantine recommendations ──
  const quarantinedTests = report.summaries.filter(
    (s: { recentFailureRate: number; totalRuns: number; testName: string }) =>
      s.recentFailureRate >= (options.threshold ?? 0.3) && s.totalRuns >= 5,
  );
  if (quarantinedTests.length > 0) {
    printSection("Auto-Quarantine Recommendations");
    process.stdout.write("  The following tests exceed the failure threshold:\n\n");
    for (const t of quarantinedTests) {
      process.stdout.write(`  • ${t.testName} (${pct(t.recentFailureRate)} recent failure rate)\n`);
    }
    process.stdout.write("\n  Use `it.quarantine()` in your test definition to auto-skip these.\n");
  }
}
