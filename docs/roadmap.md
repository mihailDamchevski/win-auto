# win-auto Roadmap

**Goal:** Make win-auto a production-ready, debuggable, observable platform that other engineers can adopt without knowing its internals.

**Status:** Phases 1–8 complete (hardening, benchmarks, API cleanup, security). Phases 9–13 ahead (tooling, determinism, release).

---

## Completed

| Phase | Name | Status | Evidence |
|-------|------|--------|----------|
| 1 | Reliability Stress Testing | ✅ Done | `tests/stress/` — 1K iterations, memory leak detection |
| 2 | Windows Compatibility Matrix | ✅ Scripts ready | `tests/compat/` — needs manual run on Win10/Win11/DPI/RDP |
| 3 | Flakiness Measurement | ✅ Done | `tests/benchmark/` — 9 benchmarks, p50/p95/p99 |
| 4 | API Review | ✅ Done | Removed aliases (`type()`, `dragTo()`, `getProperty()`), fixed naming |
| 5 | Developer Experience | ✅ Done | 5-min onboarding, README with benchmarks |
| 6 | Observability (basic) | ✅ Done | `diagnostics.ts` — screenshots + element tree on failure |
| 7 | Security & Hardening | ✅ Done | Capped buffers, regex limits, checked arithmetic, path validation |
| 8 | Performance Benchmarking | ✅ Done | Same as Phase 3 |

---

## Phase 9: Execution Trace & Failure Bundles

**Why:** "Debugging is more important than execution" at scale. Every failure needs a self-contained artifact — no reproduction required.

**What:**
- Add a `trace` option to `Automation` / `TestAutomation` that records:
  - Step-by-step execution log (actions taken, timestamps)
  - Locator decision tree (why element X was chosen over Y)
  - Timing breakdown per action
  - Input mode decisions (pattern vs hardware vs auto, and why)
  - UIA tree snapshots before/after each action
  - Screenshot on failure (already have basic version)
- Bundle into a single artifact (JSON + PNGs in a zip, or standalone HTML report)
- `win-auto diagnose` loads and renders existing bundles

**Deliverable:** `--trace` flag on `Automation`; bundle viewer in `win-auto diagnose`.

**Extends:** Phase 6 (basic diagnostic bundles) → full execution trace.

---

## Phase 10: UI Inspector (Dev Tool)

**Why:** Writing locators without seeing the UIA tree is blind. `win-auto inspect` is text-only and slow for exploration.

**What:**
- A TUI or Electron-based tree explorer showing live UIA hierarchy
- Filter by name, role, class name, automation ID
- Click a node → show all properties (bounds, patterns, legacy info)
- Preview locator expressions that would match the selected node
- Highlight overlay on the real desktop element

**Deliverable:** `win-auto inspect --tui` or standalone `win-auto inspector` that launches a GUI.

**Note:** This is the highest-ROI feature for adoption. A good inspector dramatically improves the developer experience.

---

## Phase 11: Flaky Test Economics

**Why:** CI greenness decays as test count grows. Need automated tracking and quarantine.

**What:**
- History store (local JSON or SQLite) of test results per run
- Track: failure rate, failure mode (timeout / assertion / crash), environment fingerprint
- Auto-quarantine: tests exceeding a failure threshold are skipped with a warning
- Failure clustering: group failures by shared root cause (e.g., "all tests touching dialog X fail")
- Report: `win-auto test-report` that shows stability trends

**Deliverable:** `TestAutomation` with built-in flaky tracking; `win-auto test-report` command; auto-quarantine in CI.

**Extends:** Phase 3 (benchmark suite) → long-term failure tracking.

---

## Phase 12: Determinism Layer

**Why:** Same test → same result, always. Reduces "works on my machine" and CI-only failures.

**What:**
- Deterministic wait scheduler (not `setTimeout` — poll with bounded time and fixed intervals)
- Recorded session replay: capture real UIA trees + inputs, replay against mock backend
- Mock UIA trees from production captures (replay a real desktop session in-memory)
- `waitForUiChange` improvements: debounce, coalesce, stall detection

**Deliverable:** Deterministic mode in `TestAutomation`; `record`/`replay` CLI commands.

---

## Phase 13: Architecture Freeze + Extension Points

**Why:** Stop destabilizing the Rust core. New behavior goes through plugins.

**What:**
- Define stable plugin interface (TS hooks/middleware on actions, locators, events)
- Move experimental patterns to plugins
- Core only changes for correctness, performance, or platform compatibility
- Document the extension contract

**Deliverable:** `Plugin` interface with hook points; 2+ example plugins.

---

## Decision Gate

After Phase 11 (flaky economics), reassess:

| Condition | Action |
|---|---|
| CI is green & stable | Proceed to Phase 12–13 (determinism + freeze) |
| Devs are productive | Start prep for external adoption (dual-license, API docs) |
| Usage stays low/solo | Stop at Phase 10, maintain current state |

---

## Non-Goals (for now)

- Distributed execution / agent farms
- Remote UI sessions
- Execution queueing
- External SDK / public API (until Phase 13)

---

## Release Readiness (Phase 1.0)

Before calling it 1.0:

### Required
- Zero known P0s
- Zero known leaks
- No unchecked unsafe blocks in production paths
- No unjustified unwrap/expect in production paths
- Stress tests passing
- Multi-monitor testing done
- RDP behavior documented
- CI benchmarks running

### Nice to have
- Inspector (Phase 10)
- Trace viewer (Phase 9)
- Recorder (Phase 12)
- Performance dashboard

---

**If you complete all of that, you're no longer reviewing a hobby framework — you have the foundation of something that can compete with mature Windows automation tooling.**
