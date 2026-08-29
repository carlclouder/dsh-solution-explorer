#!/usr/bin/env node
/**
 * Migrate closure `let` state in src/client/panel.ts into the shared
 * store instance (state.域.x) — TypeScript-AST driven.
 *
 * For each variable in the mapping:
 *   1. removes its `let name = ...;` declaration line
 *   2. rewrites every remaining identifier reference to `state.域.x`
 *
 * AST-driven: identifiers are located via the TS AST, so string literals,
 * template content, regex literals and comments are NEVER touched (they are
 * StringLiteral/NoSubstitutionTemplateLiteral nodes, not Identifier nodes).
 * Property names (navigator.clipboard), type positions and declaration
 * positions are excluded. Rewrites are applied on the raw source by
 * position (back-to-front), preserving the file's original formatting.
 *
 * Pure fs + ts — no child_process, runs inside the file sandbox.
 * Usage: node scripts/migrate-state.mjs scripts/mappings/tree.json
 */
import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATH = join(ROOT, 'src/client/panel.ts')
const mapPath = process.argv[2]
if (!mapPath) {
  console.error('usage: node scripts/migrate-state.mjs <mapping.json>')
  process.exit(1)
}
const mapping = JSON.parse(readFileSync(mapPath, 'utf-8'))
const SRC = readFileSync(PATH, 'utf-8')
const sf = ts.createSourceFile('panel.ts', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const isDeclPos = (n, p) =>
  (ts.isVariableDeclaration(p) && p.name === n) ||
  (ts.isParameter(p) && p.name === n) ||
  (ts.isFunctionDeclaration(p) && p.name === n) ||
  (ts.isFunctionExpression(p) && p.name === n) ||
  (ts.isClassDeclaration(p) && p.name === n) ||
  (ts.isPropertyAccessExpression(p) && p.name === n) ||
  (ts.isPropertyAssignment(p) && p.name === n) ||
  (ts.isPropertyDeclaration(p) && p.name === n) ||
  (ts.isMethodDeclaration(p) && p.name === n) ||
  (ts.isTypeReferenceNode(p)) ||
  (ts.isImportSpecifier(p)) ||
  (ts.isNamespaceImport(p)) ||
  (ts.isExportSpecifier(p)) ||
  (ts.isLabeledStatement(p)) ||
  (ts.isBreakOrContinueStatement(p))

const edits = [] // { pos, end, text }
const declLines = new Set() // 1-based line numbers of declarations to remove

function lineOf(pos) {
  return SRC.slice(0, pos).split('\n').length
}

function visit(n) {
  if (ts.isIdentifier(n)) {
    const text = n.text
    if (Object.prototype.hasOwnProperty.call(mapping, text) && !isDeclPos(n, n.parent)) {
      // getStart(sf): token start WITHOUT leading trivia — preserves the
      // whitespace before the identifier (else expandedPaths → else state...).
      edits.push({ pos: n.getStart(sf), end: n.end, text: mapping[text] })
    }
  }
  if (ts.isVariableStatement(n)) {
    for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && Object.prototype.hasOwnProperty.call(mapping, d.name.text)) {
        declLines.add(lineOf(d.name.getStart(sf)))
      }
    }
  }
  ts.forEachChild(n, visit)
}
visit(sf)

// 1. Apply reference rewrites back-to-front (positions stay valid).
let out = SRC
for (const e of [...edits].sort((a, b) => b.pos - a.pos)) {
  out = out.slice(0, e.pos) + e.text + out.slice(e.end)
}

// 2. Remove declaration lines (back-to-front; rewrites never cross lines, so
//    line numbers are unchanged).
const outLines = out.split('\n')
for (const ln of [...declLines].sort((a, b) => b - a)) {
  outLines.splice(ln - 1, 1)
}
out = outLines.join('\n')

writeFileSync(PATH, out)
console.log(`removed ${declLines.size} declaration line(s), rewrote ${edits.length} reference(s).`)
