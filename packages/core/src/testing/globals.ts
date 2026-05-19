import type { it as winAutoIt } from "./vitest";
import type { describe as vitestDescribe, expect as vitestExpect } from "vitest";

declare global {
  const describe: typeof vitestDescribe;
  const it: typeof winAutoIt;
  const expect: typeof vitestExpect;
}

export {};
