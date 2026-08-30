import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as pathModule from 'node:path'

import { git, isGitRepo } from '../git-runner.ts'
import { getGitStatus } from '../status.ts'
import { normPath } from '../paths.ts'
import { json } from '../http-util.ts'
import type { Handler } from './context.ts'

export const gitWritePost: Record<string, Handler> = {
  '/solution-explorer/git-stage': async ({ res, root, files }) => {
    if (!root || files.length === 0) { json(res, { ok: false, error: { message: 'root and files required' } }); return }
    const result = git(['add', '--', ...files], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-unstage': async ({ res, root, files }) => {
    if (!root || files.length === 0) { json(res, { ok: false, error: { message: 'root and files required' } }); return }
    const result = git(['reset', 'HEAD', '--', ...files], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-discard': async ({ res, root, files }) => {
    if (!root || files.length === 0) { json(res, { ok: false, error: { message: 'root and files required' } }); return }
    // Untracked files cannot be reverted with checkout — remove them
    // (VS Code discard behaviour; the UI confirms destructive actions).
    const status = getGitStatus(root)
    const untrackedPaths = new Set(status.ok ? status.value.untracked.map((c) => normPath(c.path)) : [])
    const untracked = files.filter((f) => untrackedPaths.has(normPath(f)))
    const tracked = files.filter((f) => !untrackedPaths.has(normPath(f)))
    try {
      for (const f of untracked) {
        const resolvedRoot = pathModule.resolve(root)
        const fullPath = pathModule.resolve(root, f)
        if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + pathModule.sep)) {
          json(res, { ok: false, error: { message: 'path traversal denied' } }); return
        }
        await fsp.rm(fullPath, { recursive: true, force: true })
      }
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
      return
    }
    if (tracked.length > 0) {
      const result = git(['checkout', '--', ...tracked], root)
      if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
    }
    json(res, { ok: true, value: true })
  },
  '/solution-explorer/git-commit': async ({ res, payload, root }) => {
    const message = typeof payload.message === 'string' ? payload.message : ''
    if (!root || !message) { json(res, { ok: false, error: { message: 'root and message required' } }); return }
    const result = git(['commit', '-m', message], root)
    json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-stage-hunk': async ({ res, payload }) => {
    const root = typeof payload.root === 'string' ? payload.root : ''
    const file = typeof payload.file === 'string' ? payload.file : ''
    const oldStart = typeof payload.oldStart === 'number' ? payload.oldStart : NaN
    const newStart = typeof payload.newStart === 'number' ? payload.newStart : NaN
    if (!root || !file || !Number.isFinite(oldStart) || !Number.isFinite(newStart)) {
      json(res, { ok: false, error: { message: 'root, file, oldStart, newStart required' } }); return
    }
    try {
      const diffResult = git(['diff', '--', file], root)
      if (!diffResult.ok) { json(res, { ok: false, error: { message: diffResult.error } }); return }
      const diffLines = diffResult.stdout.split('\n')
      // Split the diff into hunks (@@ headers), keeping the header's own line.
      const hunks: Array<{ oldStart: number; newStart: number; line: string; body: string[] }> = []
      let cur: (typeof hunks)[number] | null = null
      for (const line of diffLines) {
        const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (m) {
          cur = { oldStart: +m[1], newStart: +m[2], line, body: [] }
          hunks.push(cur)
        } else if (cur) {
          cur.body.push(line)
        }
      }
      const hunk = hunks.find((h) => h.oldStart === oldStart && h.newStart === newStart)
      if (!hunk) { json(res, { ok: false, error: { message: 'hunk not found' } }); return }
      // Patch = diff header (diff --git / index / --- / +++) + the hunk's own
      // @@ line + body. `git apply --cached` stages only this hunk into the
      // index; the working tree keeps the change (VS Code "stage selected").
      const header = diffLines.slice(0, 4).join('\n')
      const patch = `${header}\n${hunk.line}\n${hunk.body.join('\n')}\n`
      const patchFile = pathModule.join(os.tmpdir(), 'sol-exp-hunk-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.patch')
      await fsp.writeFile(patchFile, patch, 'utf-8')
      try {
        const applied = git(['apply', '--cached', patchFile], root)
        if (!applied.ok) { json(res, { ok: false, error: { message: applied.error } }); return }
        json(res, { ok: true, value: { staged: true } })
      } finally {
        await fsp.unlink(patchFile).catch(() => {})
      }
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/git-init': async ({ res, root }) => {
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    if (isGitRepo(root)) { json(res, { ok: false, error: { message: '已经是 Git 仓库' } }); return }
    const result = git(['init'], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
}
