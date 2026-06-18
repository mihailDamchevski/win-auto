import { describe, it, expect } from "vitest";
import { Automation } from "../../packages/core/src/api/automation";
import { Window } from "../../packages/core/src/api/window";
import { MockBackend } from "../../packages/core/src/mock/mockBackend";
import type { MockTreeElement } from "../../packages/core/src/mock/mockRuntime";

const STRESS_ITERATIONS = 1_000;
const SNAPSHOT_INTERVAL = 100;

type Snapshot = {
  iteration: number;
  heapUsedMB: number;
  rssMB: number;
  externalMB: number;
  timestamp: number;
};

function takeSnapshot(iteration: number): Snapshot {
  const mem = process.memoryUsage();
  return {
    iteration,
    heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(2),
    rssMB: +(mem.rss / 1024 / 1024).toFixed(2),
    externalMB: +(mem.external / 1024 / 1024).toFixed(2),
    timestamp: Date.now(),
  };
}

function analyzeSnapshots(snapshots: Snapshot[]): {
  heapGrowthMB: number;
  rssGrowthMB: number;
  leaked: boolean;
  verdict: string;
} {
  if (snapshots.length < 2) {
    return { heapGrowthMB: 0, rssGrowthMB: 0, leaked: false, verdict: "insufficient data" };
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const heapGrowthMB = +(last.heapUsedMB - first.heapUsedMB).toFixed(2);
  const rssGrowthMB = +(last.rssMB - first.rssMB).toFixed(2);

  const midIdx = Math.floor(snapshots.length / 2);
  const mid = snapshots[midIdx];
  const firstHalfRate = (mid.heapUsedMB - first.heapUsedMB) / mid.iteration;
  const secondHalfRate = (last.heapUsedMB - mid.heapUsedMB) / (last.iteration - mid.iteration);

  const leaked = heapGrowthMB > 10;
  const rateDecreased = secondHalfRate < firstHalfRate * 0.5;

  let verdict: string;
  if (leaked) {
    verdict = `LEAK DETECTED: heap grew ${heapGrowthMB}MB over ${last.iteration} iterations`;
  } else if (rateDecreased) {
    verdict = `OK: heap growth plateauing (rate decreased ${((1 - secondHalfRate / firstHalfRate) * 100).toFixed(0)}%)`;
  } else {
    verdict = `OK: heap grew ${heapGrowthMB}MB (within acceptable range)`;
  }

  return { heapGrowthMB, rssGrowthMB, leaked, verdict };
}

function buildStressTree(): MockTreeElement {
  const children: MockTreeElement[] = [];
  for (let i = 0; i < 50; i++) {
    children.push({
      name: `item-${i}`,
      role: "listitem",
      automationId: `id-${i}`,
    });
  }
  return {
    name: "stress-grid",
    role: "list",
    children: [
      ...children,
      { name: "OK", role: "button" },
      { name: "Cancel", role: "button" },
      { name: "Input", role: "textbox" },
    ],
  };
}

describe("stress test — full lifecycle", () => {
  it(`runs ${STRESS_ITERATIONS.toLocaleString()} iterations: launch → find → click → type → getValue → screenshot → close`, async () => {
    const snapshots: Snapshot[] = [];
    const tree = buildStressTree();

    for (let i = 0; i < STRESS_ITERATIONS; i++) {
      const mock = new MockBackend();
      const auto = new Automation(mock);
      const app = await auto.launchApp({ executablePath: "stress.exe" });

      const treeHandle = mock.setupElementTree(app.processId, tree, "Stress Window");
      const win = new Window(treeHandle, app.processId, mock, auto.events);

      const btn = await win.findElement({ name: "OK", role: "button" });
      expect(btn).not.toBeNull();
      await btn!.click();

      const input = await win.findElement({ name: "Input", role: "textbox" });
      expect(input).not.toBeNull();
      await input!.typeText(`iter-${i}`);

      const value = await input!.getValue();
      expect(value).toBe(`iter-${i}`);

      win.inspectTree();
      await app.close();

      if (i % SNAPSHOT_INTERVAL === 0) {
        global.gc?.();
        snapshots.push(takeSnapshot(i));
      }
    }

    const analysis = analyzeSnapshots(snapshots);

    console.log("\n=== Memory Stability Report ===");
    console.log(`Iterations: ${STRESS_ITERATIONS.toLocaleString()}`);
    console.log(`Snapshots: ${snapshots.length}`);
    console.log(`Heap growth: ${analysis.heapGrowthMB}MB`);
    console.log(`RSS growth: ${analysis.rssGrowthMB}MB`);
    console.log(`Verdict: ${analysis.verdict}`);
    console.log("\nSnapshot details:");
    for (const s of snapshots) {
      console.log(
        `  iter ${String(s.iteration).padStart(6)}: heap=${s.heapUsedMB}MB  rss=${s.rssMB}MB  ext=${s.externalMB}MB`,
      );
    }

    expect(analysis.leaked).toBe(false);
  }, 120_000);
});

describe("stress test — rapid launch/close", () => {
  it(`handles ${STRESS_ITERATIONS.toLocaleString()} rapid launch/close cycles without resource leak`, async () => {
    const snapshots: Snapshot[] = [];

    for (let i = 0; i < STRESS_ITERATIONS; i++) {
      const mock = new MockBackend();
      const auto = new Automation(mock);
      const app = await auto.launchApp({ executablePath: "cycle.exe" });
      await app.close();

      if (i % SNAPSHOT_INTERVAL === 0) {
        global.gc?.();
        snapshots.push(takeSnapshot(i));
      }
    }

    const analysis = analyzeSnapshots(snapshots);
    console.log("\n=== Rapid Launch/Close Report ===");
    console.log(`Verdict: ${analysis.verdict}`);

    expect(analysis.leaked).toBe(false);
  }, 60_000);
});
