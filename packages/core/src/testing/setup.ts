import { afterEach, describe as vitestDescribe, expect as vitestExpect } from "vitest";
import { closeTrackedApps } from "./context";
import { it } from "./vitest";

type GlobalTesting = typeof globalThis & {
  describe: typeof vitestDescribe;
  it: typeof it;
  expect: typeof vitestExpect;
};

afterEach(async () => {
  await closeTrackedApps();
});

const globals = globalThis as GlobalTesting;

globals.describe = vitestDescribe;
globals.it = it;
globals.expect = vitestExpect;
