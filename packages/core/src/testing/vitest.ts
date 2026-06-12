import { it as vitestIt, describe as vitestDescribe } from "vitest";
import type { SuiteCollector } from "vitest";
import { isCI, isRealDesktop } from "./conditions";

const DEFAULT_TEST_TIMEOUT_MS = 30_000;

type TestFn = (name: string, fn: () => void | Promise<void>, timeout?: number) => void;

const baseIt: TestFn = (name: string, fn: () => void | Promise<void>, timeout?: number) =>
  vitestIt(name, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);

const ciIt: TestFn = (name: string, fn: () => void | Promise<void>, timeout?: number) => {
  if (isCI()) {
    return vitestIt(`[CI] ${name}`, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
  }
  return vitestIt.skip(`[CI-only] ${name}`, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
};

const realDesktopIt: TestFn = (name: string, fn: () => void | Promise<void>, timeout?: number) => {
  if (isRealDesktop()) {
    return vitestIt(name, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
  }
  return vitestIt.skip(`[requires desktop] ${name}`, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
};

const flakyIt = (retries?: number) => {
  const count = retries ?? 3;
  const retry = (vitestIt as unknown as { retry: (n: number) => typeof vitestIt }).retry(count);
  return (name: string, fn: () => void | Promise<void>, timeout?: number) =>
    retry(name, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
};

export const it: typeof vitestIt & {
  ci: TestFn;
  realDesktop: TestFn;
  flaky: (
    retries?: number,
  ) => (name: string, fn: () => void | Promise<void>, timeout?: number) => void;
} = Object.assign(baseIt, vitestIt, { ci: ciIt, realDesktop: realDesktopIt, flaky: flakyIt } as {
  ci: TestFn;
  realDesktop: TestFn;
  flaky: typeof flakyIt;
});

// 8.6 — Suite-level retry via describe.flaky
type DescribeFn = (name: string, fn: () => void) => SuiteCollector;

const flakyDescribe = (retries?: number): DescribeFn => {
  const count = retries ?? 3;
  return (name: string, fn: () => void): SuiteCollector =>
    vitestDescribe(name, { retry: count }, fn);
};

export const describe: typeof vitestDescribe & {
  flaky: (retries?: number) => DescribeFn;
} = Object.assign(vitestDescribe, { flaky: flakyDescribe } as {
  flaky: typeof flakyDescribe;
});
