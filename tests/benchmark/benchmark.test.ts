import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Automation } from "../../packages/core/src/api/automation";
import { Window } from "../../packages/core/src/api/window";
import { MockBackend } from "../../packages/core/src/mock/mockBackend";
import type { MockTreeElement } from "../../packages/core/src/mock/mockRuntime";

type BenchmarkResult = {
  name: string;
  iterations: number;
  successes: number;
  failures: number;
  successRate: string;
  times: number[];
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatResult(r: BenchmarkResult): string {
  return [
    `  ${r.name}`,
    `    iterations: ${r.iterations}  success: ${r.successRate}  failures: ${r.failures}`,
    `    avg: ${r.avg.toFixed(2)}ms  min: ${r.min.toFixed(2)}ms  max: ${r.max.toFixed(2)}ms`,
    `    p50: ${r.p50.toFixed(2)}ms  p95: ${r.p95.toFixed(2)}ms  p99: ${r.p99.toFixed(2)}ms`,
  ].join("\n");
}

function benchmark(name: string, iterations: number, results: { ok: boolean; ms: number }[]): BenchmarkResult {
  const successes = results.filter((r) => r.ok).length;
  const failures = results.length - successes;
  const times = results
    .filter((r) => r.ok)
    .map((r) => r.ms)
    .sort((a, b) => a - b);

  return {
    name,
    iterations,
    successes,
    failures,
    successRate: `${((successes / iterations) * 100).toFixed(1)}%`,
    times,
    p50: times.length > 0 ? percentile(times, 50) : 0,
    p95: times.length > 0 ? percentile(times, 95) : 0,
    p99: times.length > 0 ? percentile(times, 99) : 0,
    avg: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    min: times.length > 0 ? times[0] : 0,
    max: times.length > 0 ? times[times.length - 1] : 0,
  };
}

const ITERATIONS = 1000;
const LARGE_TREE_SIZE = 500;

function buildLargeTree(): MockTreeElement {
  const children: MockTreeElement[] = [];
  for (let i = 0; i < LARGE_TREE_SIZE; i++) {
    children.push({
      name: `item-${i}`,
      role: "listitem",
      automationId: `id-${i}`,
    });
  }
  return {
    name: "data-grid",
    role: "list",
    children: [
      ...children,
      { name: "Submit", role: "button", automationId: "btn-submit" },
      { name: "Cancel", role: "button", automationId: "btn-cancel" },
      { name: "Search", role: "textbox", automationId: "txt-search" },
    ],
  };
}

describe("benchmark", () => {
  let auto: Automation;
  let mock: MockBackend;
  let app: Awaited<ReturnType<typeof auto.launchApp>>;
  let win: Window;
  let treeHandle: string;

  beforeAll(async () => {
    mock = new MockBackend();
    auto = new Automation(mock);
    app = await auto.launchApp({ executablePath: "benchmark.exe" });

    const tree = buildLargeTree();
    treeHandle = mock.setupElementTree(app.processId, tree, "Benchmark Window");

    // Construct a Window from the tree handle (setupElementTree creates a new window)
    win = new Window(treeHandle, app.processId, mock, auto.events);
  });

  afterAll(async () => {
    await app.close();
  });

  it("find element by name", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ name: `item-${i % LARGE_TREE_SIZE}`, role: "listitem" });
        results.push({ ok: el !== null, ms: performance.now() - start });
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("find element by name", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  });

  it("find element by automationId", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: `id-${i % LARGE_TREE_SIZE}` });
        results.push({ ok: el !== null, ms: performance.now() - start });
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("find by automationId", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  });

  it("click element", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: "btn-submit" });
        if (el) {
          await el.click();
          results.push({ ok: true, ms: performance.now() - start });
        } else {
          results.push({ ok: false, ms: performance.now() - start });
        }
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("click element", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  }, 60_000);

  it("type text", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: "txt-search" });
        if (el) {
          await el.typeText(`test-${i}`);
          results.push({ ok: true, ms: performance.now() - start });
        } else {
          results.push({ ok: false, ms: performance.now() - start });
        }
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("type text", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  }, 60_000);

  it("get value", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: "txt-search" });
        if (el) {
          await el.getValue();
          results.push({ ok: true, ms: performance.now() - start });
        } else {
          results.push({ ok: false, ms: performance.now() - start });
        }
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("get value", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  });

  it("screenshot", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: "btn-submit" });
        if (el) {
          await el.screenshot();
          results.push({ ok: true, ms: performance.now() - start });
        } else {
          results.push({ ok: false, ms: performance.now() - start });
        }
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("screenshot", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  }, 60_000);

  it("isVisible check", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: `id-${i % LARGE_TREE_SIZE}` });
        if (el) {
          await el.isVisible();
          results.push({ ok: true, ms: performance.now() - start });
        } else {
          results.push({ ok: false, ms: performance.now() - start });
        }
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("isVisible check", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  }, 60_000);

  it("getToggleState", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        const el = await win.findElement({ automationId: "btn-submit" });
        if (el) {
          await el.getToggleState();
          results.push({ ok: true, ms: performance.now() - start });
        } else {
          results.push({ ok: false, ms: performance.now() - start });
        }
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("getToggleState", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  }, 60_000);

  it("inspectTree", async () => {
    const results: { ok: boolean; ms: number }[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        win.inspectTree();
        results.push({ ok: true, ms: performance.now() - start });
      } catch {
        results.push({ ok: false, ms: performance.now() - start });
      }
    }
    const r = benchmark("inspectTree", ITERATIONS, results);
    console.log(formatResult(r));
    expect(r.successRate).toBe("100.0%");
  }, 60_000);
});
