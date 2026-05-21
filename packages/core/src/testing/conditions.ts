const IS_CI = Boolean(
  process.env.CI
    || process.env.GITHUB_ACTIONS
    || process.env.TF_BUILD
    || false,
);

const RUNNING_MOCK = typeof process !== "undefined"
  && process.env.WIN_AUTO_BACKEND === "mock";

export function isCI(): boolean {
  return IS_CI;
}

export function isRealDesktop(): boolean {
  return !RUNNING_MOCK;
}

export function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

export async function measureAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}
