// Runs Next.js for the desktop app: `node scripts/desktop.mjs build | dev | restore`.
//
// The desktop app is a static export, and a few route files can't work in both builds: the web's
// dynamic layouts (link previews read request headers) and preview images. While the desktop build
// runs, this swaps in desktop/overrides/** over the matching app/ files and sets the web-only files
// aside, then puts everything back when Next exits (also on Ctrl+C). If a run is killed before it
// can clean up, the next run (or `restore`) puts the files back first.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT      = process.cwd()
const OVERRIDES = 'desktop/overrides'
const BACKUP    = '.desktop-swap'
const MANIFEST  = path.join(BACKUP, 'manifest.json')

// Web-only routes, left out of the desktop build
const WEB_ONLY = [
  'app/sets/[id]/opengraph-image.tsx',
  'app/collections/[id]/opengraph-image.tsx',
  'app/create/page.tsx',
  'app/study/page.tsx',
]

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? filesUnder(p) : [p]
  })
}

function move(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
}

function restore() {
  if (!fs.existsSync(MANIFEST)) return
  const { replaced, added, removed } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  for (const rel of added) fs.rmSync(path.join(ROOT, rel), { force: true })
  for (const rel of [...replaced, ...removed]) {
    const saved = path.join(BACKUP, rel)
    if (fs.existsSync(saved)) move(saved, path.join(ROOT, rel))
  }
  fs.rmSync(BACKUP, { recursive: true, force: true })
}

function swap() {
  restore()
  const manifest = { replaced: [], added: [], removed: [] }
  const save = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  fs.mkdirSync(BACKUP, { recursive: true })
  save()
  for (const file of filesUnder(OVERRIDES)) {
    const rel = path.relative(OVERRIDES, file)
    const target = path.join(ROOT, rel)
    if (fs.existsSync(target)) { move(target, path.join(BACKUP, rel)); manifest.replaced.push(rel) }
    else manifest.added.push(rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file, target)
    save()
  }
  for (const rel of WEB_ONLY) {
    const target = path.join(ROOT, rel)
    if (!fs.existsSync(target)) continue
    move(target, path.join(BACKUP, rel))
    manifest.removed.push(rel)
    save()
  }
}

const mode = process.argv[2]
if (mode === 'restore') {
  restore()
} else if (mode === 'build' || mode === 'dev') {
  swap()
  const child = spawn('npx', ['next', mode], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NEXT_PUBLIC_TARGET: 'desktop' },
  })
  const finish = code => { restore(); process.exit(code ?? 1) }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
  child.on('exit', finish)
  child.on('error', () => finish(1))
} else {
  console.error('Usage: node scripts/desktop.mjs build | dev | restore')
  process.exit(1)
}
