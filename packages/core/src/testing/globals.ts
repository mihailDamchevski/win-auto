import type { describe as winAutoDescribe, it as winAutoIt } from "./vitest";
import type { expect as vitestExpect } from "vitest";

declare global {
  const describe: typeof winAutoDescribe;
  const it: typeof winAutoIt;
  const expect: typeof vitestExpect;
}

export {};
