#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = process.cwd();
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
} catch (e) {
  console.error("Unable to read root package.json:", e.message);
  process.exit(1);
}

const workspaces = pkg.workspaces || [];
if (!workspaces.length) {
  console.error("No workspaces defined in package.json");
  process.exit(1);
}

const packages = [];
for (const pattern of workspaces) {
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    const dir = path.join(root, base);
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const pp = path.join(dir, ent.name);
      if (fs.existsSync(path.join(pp, "package.json"))) packages.push(pp);
    }
  } else {
    const pp = path.join(root, pattern);
    if (fs.existsSync(pp) && fs.existsSync(path.join(pp, "package.json")))
      packages.push(pp);
  }
}

if (!packages.length) {
  console.error("No workspace package directories found");
  process.exit(1);
}

let failed = false;
for (const pkgDir of packages) {
  const pjsonPath = path.join(pkgDir, "package.json");
  let pj;
  try {
    pj = JSON.parse(fs.readFileSync(pjsonPath, "utf8"));
  } catch (e) {
    console.error("Skipping", pkgDir, "- invalid package.json");
    continue;
  }
  if (pj.private) {
    console.log(`Skipping private ${pj.name || pkgDir}`);
    continue;
  }
  console.log(`\nPublishing ${pj.name || pkgDir} from ${pkgDir}`);
  const res = cp.spawnSync("npm", ["publish", "--access", "public"], {
    cwd: pkgDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    console.error(`Publish failed for ${pj.name || pkgDir}`);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
