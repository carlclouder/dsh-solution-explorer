import * as fsp from 'node:fs/promises'
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
  '/solution-explorer/git-init': async ({ res, root }) => {
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    if (isGitRepo(root)) { json(res, { ok: false, error: { message: '已经是 Git 仓库' } }); return }
    const result = git(['init'], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
}
