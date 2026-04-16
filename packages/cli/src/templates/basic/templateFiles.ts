export function templatePackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        test: "vitest run",
        "test:watch": "vitest"
      },
      devDependencies: {
        "@types/node": "^22.15.3",
        typescript: "^5.8.3",
        vitest: "^3.1.1",
        "win-auto": "^0.1.0"
      }
    },
    null,
    2
  );
}

export const templateTsConfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
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

export const templateSampleSpec = `import { describe, expect, it } from "vitest";
import { Automation } from "win-auto";

describe("sample desktop automation test", () => {
  it("runs mock async flow", async () => {
    const automation = new Automation();
    const app = await automation.launchApp({
      executablePath: "C:\\\\Program Files\\\\Mock\\\\app.exe",
      title: "Sample App"
    });
    const window = await app.getMainWindow();
    const input = await window?.findElement({ automationId: "main-input", role: "textbox" });
    await input?.typeText("hello from generated project");
    expect(await input?.getText()).toBe("hello from generated project");
  });
});
`;
