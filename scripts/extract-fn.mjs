#!/usr/bin/env node
/**
 * Extract named top-level function declarations from src/client/panel.ts
 * into a new module file (appended as `export function ...`), removing them
 * from panel.ts. AST-driven: exact token ranges, formatting preserved.
 *
 * Pure fs + ts — no child_process, runs inside the file sandbox.
 * Usage: node scripts/extract-fn.mjs <output-file.ts> <fn1> <fn2> ...
 */
import ts from 'typescript'
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATH = join(ROOT, 'src/client/panel.ts')
const OUT = process.argv[2]
const FNS = process.argv.slice(3)
if (!OUT || FNS.length === 0) {
  console.error('usage: node scripts/extract-fn.mjs <output-file.ts> <fn1> <fn2> ...')
  process.exit(1)
}
const SRC = readFileSync(PATH, 'utf-8')
const sf = ts.createSourceFile('panel.ts', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const targets = [] // { start, end }
function visit(n) {
  if (ts.isFunctionDeclaration(n) && n.name && FNS.includes(n.name.text)) {
    targets.push({ start: n.getStart(sf), end: n.end })
  }
  ts.forEachChild(n, visit)
}
visit(sf)

if (targets.length !== FNS.length) {
  const found = targets.map((t) => SRC.slice(t.start, t.start + 60).split('\n')[0].trim())
  console.error(`WARNING: found ${targets.length} of ${FNS.length} functions:`)
  console.error(found.join('\n'))
}

// Remove from panel.ts (back-to-front) and collect bodies.
let out = SRC
const bodies = []
for (const t of [...targets].sort((a, b) => b.start - a.start)) {
  bodies.unshift(SRC.slice(t.start, t.end))
  out = out.slice(0, t.start) + out.slice(t.end)
}
writeFileSync(PATH, out)

// Append to the module file as exports.
const moduleSrc = bodies.map((b) => b.replace(/^function\s+/, 'export function ')).join('\n\n') + '\n'
if (!existsSync(OUT)) writeFileSync(OUT, moduleSrc)
else appendFileSync(OUT, '\n' + moduleSrc)

console.log(`extracted ${bodies.length} function(s) to ${OUT}`)
