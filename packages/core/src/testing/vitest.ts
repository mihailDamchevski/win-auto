import { it as vitestIt } from "vitest";

const DEFAULT_TEST_TIMEOUT_MS = 30_000;

export const it: typeof vitestIt = Object.assign(
  (name: string, fn: () => void | Promise<void>, timeout?: number) =>
    vitestIt(name, fn, timeout ?? DEFAULT_TEST_TIMEOUT_MS),
  vitestIt
);
