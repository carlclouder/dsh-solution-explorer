import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'

import { json, ensureInside, autoRename, movePath } from '../http-util.ts'
import { buildFileTree, searchFiles, IMAGE_EXT, imageMime } from '../tree.ts'
import { getGitStatus, annotateGitStatus } from '../status.ts'
import { Config } from '../config.ts'
import type { Handler } from './context.ts'

export const fsGet: Record<string, Handler> = {
  '/solution-explorer/tree': async ({ res, query, getConfig }) => {
    const root = query.root || ''
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    try {
      const config = getConfig()
      const tree = await buildFileTree(root, '', config.filterPatterns, !!config.showHidden)
      // Annotate each file with its git status letter and each directory
      // with a "modified" marker (VS Code explorer style).
      const status = getGitStatus(root)
      if (status.ok) annotateGitStatus(tree, status.value)
      json(res, { ok: true, value: tree })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/settings': async ({ res, getConfig }) => {
    json(res, { ok: true, value: getConfig() })
  },
  '/solution-explorer/read': async ({ res, query }) => {
    const root = query.root || ''
    const file = query.file || ''
    if (!root || !file) { json(res, { ok: false, error: { message: 'root and file required' } }); return }
    try {
      const resolvedRoot = pathModule.resolve(root)
      const fullPath = pathModule.resolve(root, file)
      if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + pathModule.sep)) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      const stat = await fsp.stat(fullPath)
      // Image files are reported as image so the editor renders a
      // preview (served raw via /solution-explorer/raw) instead of
      // rejecting them as binary text.
      const imageExt = pathModule.extname(fullPath).slice(1).toLowerCase()
      if (IMAGE_EXT.has(imageExt)) {
        json(res, { ok: true, value: { content: '', mtime: stat.mtimeMs, size: stat.size, supported: true, image: true, mime: imageMime(imageExt) } })
        return
      }
      // Binary detection: a NUL byte in the head chunk marks a file the
      // text editor cannot display (exe, dll, archives, ...).
      const fh = await fsp.open(fullPath, 'r')
      let supported = true
      try {
        const head = Buffer.alloc(4096)
        const { bytesRead } = await fh.read(head, 0, 4096, 0)
        if (bytesRead > 0 && head.subarray(0, bytesRead).includes(0)) supported = false
      } finally {
        await fh.close()
      }
      if (!supported) {
        json(res, { ok: true, value: { content: '', mtime: stat.mtimeMs, size: stat.size, supported: false } })
        return
      }
      const content = await fsp.readFile(fullPath, 'utf-8')
      json(res, { ok: true, value: { content, mtime: stat.mtimeMs, size: stat.size, supported: true } })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/raw': async ({ res, query }) => {
    // Serve a file's raw bytes (images for the editor preview).
    const root = query.root || ''
    const file = query.file || ''
    if (!root || !file) { json(res, { ok: false, error: { message: 'root and file required' } }); return }
    try {
      const resolvedRoot = pathModule.resolve(root)
      const fullPath = pathModule.resolve(root, file)
      if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + pathModule.sep)) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      const ext = pathModule.extname(fullPath).slice(1).toLowerCase()
      const buf = await fsp.readFile(fullPath)
      res.writeHead(200, { 'content-type': IMAGE_EXT.has(ext) ? imageMime(ext) : 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(buf)
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/search': async ({ res, query }) => {
    const root = query.root || ''
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    try {
      json(res, { ok: true, value: await searchFiles(root, (query.q || '').toLowerCase()) })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
}

export const fsPost: Record<string, Handler> = {
  '/solution-explorer/settings': async ({ res, payload, getConfig, setConfig, persist }) => {
    const next: Config = { ...getConfig() }
    if (typeof payload.defaultWidth === 'number' && payload.defaultWidth >= 264 && payload.defaultWidth <= 420) next.defaultWidth = payload.defaultWidth
    if (typeof payload.autoOpen === 'boolean') next.autoOpen = payload.autoOpen
    if (typeof payload.showHidden === 'boolean') next.showHidden = payload.showHidden
    if (typeof payload.terminalShell === 'string') next.terminalShell = payload.terminalShell
    if (typeof payload.terminalMaxTabs === 'number') next.terminalMaxTabs = Math.min(16, Math.max(2, Math.floor(payload.terminalMaxTabs)))
    if (typeof payload.terminalHeight === 'number') next.terminalHeight = Math.min(480, Math.max(120, Math.floor(payload.terminalHeight)))
    if (typeof payload.terminalMaxHeight === 'number') next.terminalMaxHeight = Math.min(1080, Math.max(240, Math.floor(payload.terminalMaxHeight)))
    if (Array.isArray(payload.filterPatterns)) next.filterPatterns = payload.filterPatterns.filter((x): x is string => typeof x === 'string')
    const parsed = Config(next)
    setConfig(parsed)
    await persist(parsed)
    json(res, { ok: true, value: parsed })
  },
  '/solution-explorer/delete': async ({ res, payload, root }) => {
    const target = typeof payload.path === 'string' ? payload.path : ''
    if (!root || !target) { json(res, { ok: false, error: { message: 'root and path required' } }); return }
    try {
      const resolvedRoot = pathModule.resolve(root)
      const fullPath = pathModule.resolve(root, target)
      if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + pathModule.sep)) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      await fsp.rm(fullPath, { recursive: true, force: true })
      json(res, { ok: true, value: true })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/write': async ({ res, payload, root }) => {
    const target = typeof payload.path === 'string' ? payload.path : ''
    const content = typeof payload.content === 'string' ? payload.content : payload.content as unknown
    if (!root || !target) { json(res, { ok: false, error: { message: 'root and path required' } }); return }
    if (typeof content !== 'string') { json(res, { ok: false, error: { message: 'content must be a string' } }); return }
    try {
      // Resolve and clamp the target strictly inside the workspace root.
      const resolvedRoot = pathModule.resolve(root)
      const fullPath = pathModule.resolve(root, target)
      if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + pathModule.sep)) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      const dir = pathModule.dirname(fullPath)
      if (!dir.startsWith(resolvedRoot) && dir !== resolvedRoot) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(fullPath, content, 'utf-8')
      json(res, { ok: true, value: { path: target } })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/paste': async ({ res, payload, root }) => {
    const mode = payload.mode === 'cut' ? 'cut' : 'copy'
    const source = typeof payload.source === 'string' ? payload.source : ''
    const targetDir = typeof payload.targetDir === 'string' ? payload.targetDir : ''
    if (!root || !source || !targetDir) { json(res, { ok: false, error: { message: 'root, source and targetDir required' } }); return }
    try {
      const sourcePath = pathModule.resolve(root, source)
      // An empty targetDir means the workspace root itself.
      const targetBase = targetDir ? pathModule.resolve(root, targetDir) : pathModule.resolve(root)
      if (!ensureInside(root, source) || (targetDir && !ensureInside(root, targetDir))) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      // A cut must not move a directory into itself.
      if (mode === 'cut' && (targetBase === sourcePath || targetBase.startsWith(sourcePath + pathModule.sep))) {
        json(res, { ok: false, error: { message: 'cannot move into itself' } }); return
      }
      const dest = await autoRename(pathModule.join(targetBase, pathModule.basename(sourcePath)))
      if (mode === 'cut') await movePath(sourcePath, dest)
      else await fsp.cp(sourcePath, dest, { recursive: true, force: false })
      json(res, { ok: true, value: { path: pathModule.relative(root, dest) } })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/move': async ({ res, payload, root }) => {
    const source = typeof payload.source === 'string' ? payload.source : ''
    const targetDir = typeof payload.targetDir === 'string' ? payload.targetDir : ''
    if (!root || !source || !targetDir) { json(res, { ok: false, error: { message: 'root, source and targetDir required' } }); return }
    try {
      const sourcePath = pathModule.resolve(root, source)
      // An empty targetDir means the workspace root itself.
      const targetBase = targetDir ? pathModule.resolve(root, targetDir) : pathModule.resolve(root)
      if (!ensureInside(root, source) || (targetDir && !ensureInside(root, targetDir))) {
        json(res, { ok: false, error: { message: 'path traversal denied' } }); return
      }
      if (targetBase === sourcePath || targetBase.startsWith(sourcePath + pathModule.sep)) {
        json(res, { ok: false, error: { message: 'cannot move into itself' } }); return
      }
      const dest = await autoRename(pathModule.join(targetBase, pathModule.basename(sourcePath)))
      await movePath(sourcePath, dest)
      json(res, { ok: true, value: { path: pathModule.relative(root, dest) } })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/rename': async ({ res, payload, root }) => {
    const source = typeof payload.source === 'string' ? payload.source : ''
    const newName = typeof payload.newName === 'string' ? payload.newName : ''
    if (!root || !source || !newName) { json(res, { ok: false, error: { message: 'root, source and newName required' } }); return }
    if (newName === '.' || newName === '..' || /[\\/]/.test(newName)) { json(res, { ok: false, error: { message: 'invalid name' } }); return }
    try {
      const sourcePath = pathModule.resolve(root, source)
      if (!ensureInside(root, source)) { json(res, { ok: false, error: { message: 'path traversal denied' } }); return }
      const dest = pathModule.join(pathModule.dirname(sourcePath), newName)
      if (dest === sourcePath) { json(res, { ok: true, value: { path: source } }); return }
      const exists = await fsp.stat(dest).then(() => true).catch(() => false)
      if (exists) { json(res, { ok: false, error: { message: '目标已存在' } }); return }
      await fsp.rename(sourcePath, dest)
      json(res, { ok: true, value: { path: pathModule.relative(root, dest) } })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/upload': async ({ res, payload, root }) => {
    const target = typeof payload.path === 'string' ? payload.path : ''
    const content = typeof payload.content === 'string' ? payload.content : ''
    const binary = payload.binary === true
    if (!root || !target) { json(res, { ok: false, error: { message: 'root and path required' } }); return }
    // ~50MB binary cap; base64 inflates by ~4/3.
    if (content.length > 70 * 1024 * 1024) { json(res, { ok: false, error: { message: 'file too large (max 50MB)' } }); return }
    try {
      if (!ensureInside(root, target)) { json(res, { ok: false, error: { message: 'path traversal denied' } }); return }
      const fullPath = await autoRename(pathModule.resolve(root, target))
      const dir = pathModule.dirname(fullPath)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(fullPath, binary ? Buffer.from(content, 'base64') : content, binary ? undefined : 'utf-8')
      json(res, { ok: true, value: { path: pathModule.relative(root, fullPath) } })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
  '/solution-explorer/create': async ({ res, payload, root }) => {
    const target = typeof payload.path === 'string' ? payload.path : ''
    const type = payload.type === 'dir' ? 'dir' : 'file'
    if (!root || !target) { json(res, { ok: false, error: { message: 'root and path required' } }); return }
    try {
      if (!ensureInside(root, target)) { json(res, { ok: false, error: { message: 'path traversal denied' } }); return }
      const fullPath = pathModule.resolve(root, target)
      if (type === 'dir') {
        await fsp.mkdir(fullPath, { recursive: false })
      } else {
        const dir = pathModule.dirname(fullPath)
        const resolvedRoot = pathModule.resolve(root)
        if (dir !== resolvedRoot && !dir.startsWith(resolvedRoot + pathModule.sep)) {
          json(res, { ok: false, error: { message: 'path traversal denied' } }); return
        }
        await fsp.writeFile(fullPath, '', { flag: 'wx' })
      }
      json(res, { ok: true, value: { path: target } })
    } catch (err: any) {
      const msg = err?.code === 'EEXIST' ? '已存在同名文件或文件夹' : (err instanceof Error ? err.message : String(err))
      json(res, { ok: false, error: { message: msg } })
    }
  },
}
