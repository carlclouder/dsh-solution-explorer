#!/usr/bin/env node
/**
 * Delete 1-based inclusive line ranges from a file, largest first so earlier
 * line numbers stay valid. Usage:
 *   node scripts/delete-lines.mjs <file> <from-to> [<from-to> ...]
 * Pure fs — no child_process, runs inside the file sandbox.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const ranges = process.argv.slice(3).map((r) => r.split('-').map(Number))
if (!file || ranges.length === 0) {
  console.error('usage: node scripts/delete-lines.mjs <file> <from-to> [<from-to> ...]')
  process.exit(1)
}
const lines = readFileSync(file, 'utf-8').split('\n')
let removed = 0
for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) {
  lines.splice(a - 1, b - a + 1)
  removed += b - a + 1
}
writeFileSync(file, lines.join('\n'))
console.log(`removed ${removed} line(s) from ${file}`)
