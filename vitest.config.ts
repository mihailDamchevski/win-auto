import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["packages/core/src/testing/setup.ts"],
    include: ["tests/**/*.test.ts", "packages/**/src/**/*.test.ts"]
  },
});
