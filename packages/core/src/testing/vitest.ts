import { it as vitestIt } from "vitest";
import { isCI, isRealDesktop } from "./conditions";

const DEFAULT_TEST_TIMEOUT_MS = 30_000;

type TestFn = (name: string, fn: () => void | Promise<void>, timeout?: number) => void;

const baseIt: TestFn = (
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
) => vitestIt(name, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);

const ciIt: TestFn = (
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
) => {
  if (isCI()) {
    return vitestIt(`[CI] ${name}`, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
  }
  return vitestIt.skip(`[CI-only] ${name}`, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
};

const realDesktopIt: TestFn = (
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
) => {
  if (isRealDesktop()) {
    return vitestIt(name, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
  }
  return vitestIt.skip(`[requires desktop] ${name}`, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS);
};

export const it: typeof vitestIt = Object.assign(
  baseIt,
  vitestIt,
  { ci: ciIt, realDesktop: realDesktopIt } as { ci: TestFn; realDesktop: TestFn },
);
