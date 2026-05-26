import fs from "node:fs/promises";
import path from "node:path";
import {
  templatePackageJson,
  templateSampleSpec,
  templateTsConfig,
  templateVitestConfig,
  templateWinAutoConfig,
  templateGitHubActions,
} from "../templates/basic/templateFiles";

async function ensurePathDoesNotExist(targetPath: string): Promise<void> {
  try {
    await fs.access(targetPath);
    throw new Error(`Target directory already exists: ${targetPath}`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export async function initProject(projectName: string): Promise<void> {
  if (!projectName || projectName.trim().length === 0) {
    throw new Error("Project name is required. Usage: win-auto init <project-name>");
  }

  const cwd = process.cwd();
  const targetDir = path.resolve(cwd, projectName);
  await ensurePathDoesNotExist(targetDir);

  await fs.mkdir(path.join(targetDir, "tests"), { recursive: true });
  await fs.mkdir(path.join(targetDir, ".github", "workflows"), { recursive: true });
  await fs.writeFile(path.join(targetDir, ".github", "workflows", "test.yml"), templateGitHubActions, "utf8");
  await fs.writeFile(path.join(targetDir, "package.json"), templatePackageJson(projectName), "utf8");
  await fs.writeFile(path.join(targetDir, "tsconfig.json"), templateTsConfig, "utf8");
  await fs.writeFile(path.join(targetDir, "win-auto.config.ts"), templateWinAutoConfig, "utf8");
  await fs.writeFile(path.join(targetDir, "vitest.config.ts"), templateVitestConfig, "utf8");
  await fs.writeFile(path.join(targetDir, "tests", "sample.spec.ts"), templateSampleSpec, "utf8");

  process.stdout.write(`Initialized project at ${targetDir}\n`);
  process.stdout.write("Next steps:\n");
  process.stdout.write(`  cd ${projectName}\n`);
  process.stdout.write("  npm install\n");
  process.stdout.write("  npm test\n");
}
