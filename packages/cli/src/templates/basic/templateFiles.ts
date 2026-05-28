export function templatePackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        test: "vitest run",
        "test:watch": "vitest",
      },
      devDependencies: {
        "@types/node": "^22.15.3",
        "@win-auto/core": "^0.1.0",
        typescript: "^5.8.3",
        vitest: "^3.1.1",
        "win-auto": "^0.1.0",
      },
    },
    null,
    2,
  );
}

export const templateTsConfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["tests/**/*.ts", "win-auto.config.ts"]
}
`;

export const templateWinAutoConfig = `export default {
  runtime: "mock",
  timeoutMs: 10000
};
`;

export const templateVitestConfig = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["@win-auto/core/testing/setup"]
  }
});
`;

export const templateGitHubActions = `name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
        continue-on-error: false
      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: screenshots
          path: screenshots/
          if-no-files-found: ignore
`;

export const templateSampleSpec = `import "@win-auto/core/testing/globals";
import { TestAutomation } from "@win-auto/core";

describe("sample desktop automation test", () => {
  it("runs mock async flow", async () => {
    const automation = new TestAutomation();
    const app = await automation.launchApp({
      executablePath: "C:\\\\Program Files\\\\Mock\\\\app.exe",
      title: "Sample App"
    });
    const window = await app.waitForMainWindow();
    const input = await window.findElement({ automationId: "main-input", role: "textbox" });
    await input?.typeText("hello from generated project");
    expect(await input?.getText()).toBe("hello from generated project");
  });
});
`;
