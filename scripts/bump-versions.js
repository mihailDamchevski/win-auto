#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'),'utf8'))
const workspaces = pkg.workspaces || []

function incPatch(v) {
  const parts = v.split('.')
  if (parts.length !== 3) return v
  const major = parts[0], minor = parts[1], patch = parseInt(parts[2],10)
  return [major, minor, (patch+1).toString()].join('.')
}

function resolveWorkspacePackages() {
  const packages = []
  for (const pattern of workspaces) {
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2)
      const dir = path.join(root, base)
      if (!fs.existsSync(dir)) continue
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue
        const pp = path.join(dir, ent.name)
        const pjson = path.join(pp, 'package.json')
        if (fs.existsSync(pjson)) packages.push(pp)
      }
    } else {
      const pp = path.join(root, pattern)
      const pjson = path.join(pp, 'package.json')
      if (fs.existsSync(pjson)) packages.push(pp)
    }
  }
  return packages
}

const pkgDirs = resolveWorkspacePackages()
if (!pkgDirs.length) {
  console.error('No workspace packages found')
  process.exit(1)
}

// read all package.jsons
const meta = pkgDirs.map(d => {
  const p = JSON.parse(fs.readFileSync(path.join(d,'package.json'),'utf8'))
  return { dir: d, pkg: p }
})

// compute new versions
const nameToVersion = {}
for (const m of meta) {
  if (m.pkg.private) continue
  const oldV = m.pkg.version || '0.0.0'
  const newV = incPatch(oldV)
  nameToVersion[m.pkg.name] = newV
}

if (!Object.keys(nameToVersion).length) {
  console.error('No non-private workspace packages to bump')
  process.exit(1)
}

// apply new versions
for (const m of meta) {
  const p = m.pkg
  if (p.private) continue
  const newV = nameToVersion[p.name]
  if (!newV) continue
  p.version = newV
  fs.writeFileSync(path.join(m.dir,'package.json'), JSON.stringify(p, null, 2) + '\n')
  console.log(`Bumped ${p.name} -> ${newV}`)
}

// update cross-dependencies to bumped versions
function updateDeps(obj) {
  if (!obj) return false
  let changed = false
  for (const depName of Object.keys(obj)) {
    if (nameToVersion[depName]) {
      obj[depName] = nameToVersion[depName]
      changed = true
    }
  }
  return changed
}

for (const m of meta) {
  let changed = false
  const p = JSON.parse(fs.readFileSync(path.join(m.dir,'package.json'),'utf8'))
  changed = updateDeps(p.dependencies) || changed
  changed = updateDeps(p.devDependencies) || changed
  changed = updateDeps(p.peerDependencies) || changed
  changed = updateDeps(p.optionalDependencies) || changed
  if (changed) {
    fs.writeFileSync(path.join(m.dir,'package.json'), JSON.stringify(p, null, 2) + '\n')
    console.log(`Updated inter-package deps in ${p.name}`)
  }
}

console.log('\nAll done. Run `npm run publish:all` to publish updated packages.')
