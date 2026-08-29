#!/usr/bin/env node
/**
 * Scan src/client/panel.ts and build a per-function closure-variable
 * read/write matrix using the TypeScript AST (correct lexing of strings,
 * templates, regex literals — no fragile brace pairing).
 *
 * Pure fs + ts API — no child_process, runs inside the file sandbox.
 * Usage: node scripts/closure-matrix.mjs [--json]
 *
 * For each target function it reports the closure states referenced inside
 * its body (incl. nested closures) — the M0 deliverable that completes the
 * §5 signature table. Locals (params, let/const/var/function/class/catch
 * declarations anywhere in the function tree) are excluded, so only true
 * closure references remain.
 */
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATH = join(ROOT, 'src/client/panel.ts')
const SRC = readFileSync(PATH, 'utf-8')
const sf = ts.createSourceFile('panel.ts', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

// The 93 closure states (CLIENT-RENDER-REFACTOR-PLAN.md §1.2).
const STATES = new Set([
  'root', 'currentTab', 'activeEl', 'loadSeq', 'contextMenuEl',
  'treeState', 'loading', 'error', 'expandedPaths', 'selectedPath', 'selectedPaths',
  'renamingPath', 'selectionAnchor',
  'clipboard', 'dragPaths', 'dropTargetPath',
  'searchQuery', 'searchResults', 'searching', 'searchTimer',
  'gitStatus', 'gitStatusChanged', 'lastHeadHash', 'repos', 'activeRepo', 'gitChangesCount',
  'commitMessage', 'committing', 'collapsedSections', 'scmSplit', 'scmDragging',
  'remotePanelOpen', 'branchPanelOpen', 'remotesList', 'branchesList', 'remoteName',
  'remoteUrl', 'branchName', 'branchFrom', 'branchNewName', 'tagsList',
  'commitsPage', 'commitsAllLoaded', 'commitsLoading', 'commitsHTML', 'commitsSeq',
  'graphLanes', 'graphPrevLanes', 'graphDetailOpen', 'graphColorInUse',
  'commitDetailCache', 'commitTipEl', 'commitTipHash', 'commitTipPending',
  'commitTipShowTimer', 'commitTipHideTimer', 'remotesResolved',
  'PANEL_WIDTH', 'panelAutoOpen', 'settingsLoaded', 'panelWidth', 'panelDragged',
  'panelCollapsed', 'panelFrame', 'panelCol', 'shellTracks', 'lastGridApplied',
  'styleObs', 'sizeObs', 'resizeHandle', 'mountObs',
  'terminalOpen', 'terminalSupported', 'terminalHeight', 'terminalMaxHeight',
  'terminalMaxTabs', 'terminalShell', 'terminalTabs', 'terminalSeq', 'terminalBusy',
  'terminalActiveTab', 'terminalShellEl', 'terminalRebootTimer',
  'terminalStreamOn', 'terminalStreamCtrl', 'termSizeObserver', 'termSettleUntil',
  'termLastSize', 'termInputTimer', 'termInputPending', 'termInputInFlight',
  'termInputTail', 'termOutputFlush',
])

const FN_TARGETS = [
  'render', 'loadTree', 'refreshTreeSilent', 'loadRepos', 'loadGitStatus',
  'resetGraph', 'allocGraphColor', 'freeGraphColor', 'renderGraphRow',
  'getCommitDetail', 'commitDetailInlineHTML', 'ensureCommitDetailInline',
  'reapplyCommitDetailInline', 'githubCommitUrl', 'commitTooltipHTML',
  'buildCommitTooltip', 'positionCommitTooltip', 'hideCommitTooltip',
  'scheduleHideCommitTooltip', 'cancelHideCommitTooltip', 'showCommitTooltip',
  'loadRemotes', 'loadBranches', 'loadTags',
  'commitsListHTML', 'loadRecentCommits', 'loadCommitsPage',
  'doStage', 'doUnstage', 'doDiscard', 'doCommit', 'searchFiles',
  'buildHTML', 'buildSearchContent', 'buildExplorerContent',
  'buildSCMTopHTML', 'buildSCMContent', 'buildSCMItem',
  'renderTreeNode', 'reconcileTree', 'hideContextMenu',
  'parseGridTracks', 'trackPx', 'clampPanelWidth', 'findFrame', 'applyGrid',
  'mountColumn', 'waitForFrame', 'handleSessionChange',
]
const CONST_TARGETS = [
  'gitRoot', 'termLang', 'terminalCwd', 'terminalCellSize', 'terminalShellName',
  'showTerminalError', 'ensureTerminalShell', 'renderTerminalTabs',
  'activateTerminalTab', 'fitTerminal', 'scheduleTerminalReboot',
  'flushTerminalInput', 'queueTerminalInput', 'flushTerminalOutput',
  'queueTerminalOutput', 'ensureTerminalStream', 'stopTerminalStream',
  'addTerminalTab', 'closeTerminalTab', 'terminalCenterCol', 'placeTerminal',
  'syncTerminalUI', 'toggleTerminal', 'onWindowResize', 'applySettings',
]

/** Collect true closure references of a function body (excl. locals). */
function collectRefs(body) {
  const locals = new Set()
  const refs = new Map()

  const collectDecls = (n) => {
    if (ts.isParameter(n) && n.name && ts.isIdentifier(n.name)) locals.add(n.name.text)
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) locals.add(n.name.text)
    else if (ts.isFunctionDeclaration(n) && n.name) locals.add(n.name.text)
    else if (ts.isFunctionExpression(n) && n.name) locals.add(n.name.text)
    else if (ts.isClassDeclaration(n) && n.name) locals.add(n.name.text)
    else if (ts.isCatchClause(n) && n.variableDeclaration && ts.isIdentifier(n.variableDeclaration.name)) locals.add(n.variableDeclaration.name.text)
    ts.forEachChild(n, collectDecls)
  }
  collectDecls(body)

  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent
      const isDeclPos =
        (ts.isVariableDeclaration(p) && p.name === n) ||
        (ts.isParameter(p) && p.name === n) ||
        (ts.isFunctionDeclaration(p) && p.name === n) ||
        (ts.isFunctionExpression(p) && p.name === n) ||
        (ts.isClassDeclaration(p) && p.name === n) ||
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        (ts.isPropertyDeclaration(p) && p.name === n) ||
        (ts.isTypeReferenceNode(p)) ||
        (ts.isImportSpecifier(p)) ||
        (ts.isNamespaceImport(p)) ||
        (ts.isExportSpecifier(p)) ||
        (ts.isLabeledStatement(p)) ||
        (ts.isBreakOrContinueStatement(p)) ||
        (ts.isCallExpression(p) && p.expression === n) // function refs are not state refs
      if (!isDeclPos && !locals.has(n.text) && STATES.has(n.text)) {
        refs.set(n.text, (refs.get(n.text) || 0) + 1)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(body)
  return refs
}

function lineOf(pos) {
  return SRC.slice(0, pos).split('\n').length
}

const rows = []
const byName = new Map()

const visitAll = (n) => {
  if (ts.isFunctionDeclaration(n) && n.name) {
    const name = n.name.text
    if (FN_TARGETS.includes(name)) {
      const entry = byName.get(name) || []
      entry.push({ line: lineOf(n.pos), refs: collectRefs(n.body) })
      byName.set(name, entry)
    }
  } else if (ts.isVariableStatement(n)) {
    for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && ts.isArrowFunction(d.initializer) && CONST_TARGETS.includes(d.name.text)) {
        const name = d.name.text
        const entry = byName.get(name) || []
        entry.push({ line: lineOf(d.pos), refs: collectRefs(d.initializer.body) })
        byName.set(name, entry)
      }
    }
  }
  ts.forEachChild(n, visitAll)
}
visitAll(sf)

for (const [name, entries] of byName) {
  for (const e of entries) rows.push({ name, line: e.line, refs: e.refs })
}
rows.sort((a, b) => a.line - b.line)

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
} else {
  const out = []
  for (const r of rows) {
    const names = [...r.refs.keys()]
    out.push(`${String(r.line).padStart(4)} ${r.name.padEnd(26)} refs=${String(names.length).padStart(2)} ${names.join(' ')}`)
  }
  process.stdout.write(out.join('\n') + '\n')
}
