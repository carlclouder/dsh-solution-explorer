/**
 * dsh-solution-explorer — host half: the workspace-gated filesystem and git
 * services via /solution-explorer/* HTTP routes. Provides file tree browsing,
 * file reading, search, git status, staging, diff, commit, and log.
 *
 * The browser half (exports "./client") is served by client-modules from the
 * same package's dsh.client declaration.
 * @module dsh-solution-explorer
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-system-prompt'
import z from '@deepseek-ai/schemastery'
import { execFileSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'

/** Plugin configuration schema (all optional with defaults). */
export interface Config {
  /** Default panel width in px (264-420). */
  defaultWidth?: number
  /** Whether to auto-open the panel when a session activates. */
  autoOpen?: boolean
  /** Glob patterns to hide from the file tree. */
  filterPatterns?: string[]
}

export const Config: z<Config> = z.object({
  defaultWidth: z.number().step(1).min(264).max(420).default(280),
  autoOpen: z.boolean().default(true),
  filterPatterns: z.array(z.string()).default([]),
})

/** Required services: the route registry, the workspace registry, and the prompt band. */
export const inject = ['webServer', 'workspaceRegistry', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210

/** Model-facing announcement. */
export const EXPLORER_GUIDANCE = '本机已安装 dsh-solution-explorer 插件（DSH Web GUI 的右侧源代码管理面板）：项目会话打开时，聊天区右侧出现文件浏览器与源代码管理面板。能力：文件树浏览当前工作区目录（显示 git 状态标记 M/A/D/U/R），点击文件在编辑标签中查看与编辑内容（支持保存，Ctrl+S 或保存按钮），按文件名搜索；源代码管理面板显示暂存/未暂存/未跟踪变更清单，支持暂存/取消暂存/放弃变更，提交，查看差异与最近提交历史。数据源为当前会话工作目录的真实文件系统与 git 仓库，宿主进程经 /solution-explorer/* 路由提供。用户提到「右侧面板 / 文件浏览器 / 源代码管理 / 文件树 / 资源管理器 / 变更面板」时即指本插件，请据此协作。'

// ─── Git helpers ────────────────────────────────────────────────────────────

/**
 * Run a git command in the given repo root.
 *
 * Uses execFileSync (args passed as an array, no shell quoting) so the command
 * line survives Windows cmd.exe tokenization — a string-built form like
 * `git ["status","--porcelain","-u"]` is collapsed into a single bogus
 * argument and fails with "not a git command".
 */
function git(args: string[], root: string): { ok: true; stdout: string } | { ok: false; error: string } {
  try {
    const stdout = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    })
    // trimEnd (not trim): porcelain status lines start with a status-column
    // space (" M file") that a full trim would eat off the first line, making
    // the first modified file look staged with a mangled path.
    return { ok: true, stdout: stdout.toString().trimEnd() }
  } catch (err: any) {
    return { ok: false, error: err.stderr?.toString().trim() || err.message || String(err) }
  }
}

function isGitRepo(root: string): boolean {
  return git(['rev-parse', '--git-dir'], root).ok
}

/** Get the structured git status of a repo. */
function getGitStatus(root: string): GitEnvelope {
  if (!isGitRepo(root)) {
    return { ok: true, value: { staged: [], unstaged: [], untracked: [], ahead: 0, behind: 0, branch: 'unknown' } }
  }
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
  const branch = branchResult.ok ? branchResult.stdout : 'HEAD'

  const aheadBehind = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], root)
  let ahead = 0, behind = 0
  if (aheadBehind.ok) {
    const parts = aheadBehind.stdout.split('\t')
    ahead = parseInt(parts[0] || '0', 10)
    behind = parseInt(parts[1] || '0', 10)
  }

  const statusResult = git(['status', '--porcelain', '-u'], root)
  const staged: GitChange[] = []
  const unstaged: GitChange[] = []
  const untracked: GitChange[] = []

  if (statusResult.ok && statusResult.stdout) {
    const lines = statusResult.stdout.split('\n')
    for (const line of lines) {
      if (line.length < 3) continue
      const st = line[0]
      const us = line[1]
      const filePath = line.substring(3).trim()
      const match = filePath.match(/^(.+?)\s+->\s+(.+)$/)
      const path = match ? match[2].trim() : filePath
      const oldPath = match ? match[1].trim() : undefined

      if (st === '?' && us === '?') {
        untracked.push({ path, status: '?' })
        continue
      }
      if (st !== ' ') staged.push({ path, status: st, oldPath })
      if (us !== ' ') unstaged.push({ path, status: us, oldPath })
    }
  }

  return { ok: true, value: { staged, unstaged, untracked, ahead, behind, branch } }
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function json(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

/** Parse a query string into a record. */
function parseQuery(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { out[k] = v })
  return out
}

// ─── Tree & search ──────────────────────────────────────────────────────────

async function buildFileTree(root: string, relativePath: string): Promise<FileTreeNode> {
  const fullPath = relativePath ? pathModule.join(root, relativePath) : root
  const name = relativePath ? pathModule.basename(relativePath) : pathModule.basename(root)
  const stat = await fsp.stat(fullPath)
  const node: FileTreeNode = {
    name, path: relativePath || '/',
    type: stat.isDirectory() ? 'directory' : 'file',
    size: stat.size, mtime: stat.mtimeMs,
  }
  if (stat.isDirectory()) {
    const entries = await fsp.readdir(fullPath, { withFileTypes: true })
    const sorted = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
    node.children = []
    for (const entry of sorted) {
      const childRel = relativePath ? pathModule.join(relativePath, entry.name) : entry.name
      try {
        node.children.push(await buildFileTree(root, childRel))
      } catch { /* skip unreadable */ }
    }
  }
  return node
}

/** Normalize a path to forward slashes for git-status matching. */
function normPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Annotate each file node with its git status letter (M/A/D/R/U/?) and each
 * directory with 'modified' when any descendant has changes — VS Code style.
 * @param node - the tree node to annotate.
 * @param status - the repository git status (staged + unstaged + untracked).
 * @returns whether this node (or any descendant) has a change.
 */
function annotateGitStatus(node: FileTreeNode, status: GitStatusData): boolean {
  const map = new Map<string, string>()
  for (const c of [...status.staged, ...status.unstaged, ...status.untracked]) {
    if (!map.has(normPath(c.path))) map.set(normPath(c.path), c.status)
  }
  const walk = (n: FileTreeNode): boolean => {
    const key = normPath(n.path)
    if (n.type === 'file') {
      n.gitStatus = map.get(key)
      return n.gitStatus !== undefined
    }
    let hasChanges = false
    for (const child of n.children ?? []) {
      if (walk(child)) hasChanges = true
    }
    n.gitStatus = hasChanges ? 'M' : undefined
    return hasChanges
  }
  walk(node)
  return true
}

async function searchFiles(root: string, query: string, maxResults = 50): Promise<FileSearchResult[]> {
  const results: FileSearchResult[] = []
  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (results.length >= maxResults) return
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fullPath = pathModule.join(dir, entry.name)
        const rel = pathModule.relative(root, fullPath)
        if (entry.name.toLowerCase().includes(query)) {
          results.push({ name: entry.name, path: rel, type: entry.isDirectory() ? 'directory' : 'file' })
        }
        if (entry.isDirectory()) await walk(fullPath)
      }
    } catch { /* skip */ }
  }
  await walk(root)
  return results
}

// ─── Plugin apply ───────────────────────────────────────────────────────────

export function apply(ctx: Context, config: Config = {}): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:solution-explorer',
    order: SECTION_ORDER,
    text: EXPLORER_GUIDANCE,
  }), 'dsh-solution-explorer: prompt section')

  ctx.effect(() => {
    const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const url = new URL(req.url ?? '/', 'http://x')
      const pathname = url.pathname
      const query = parseQuery(url)

      // ── GET routes ────────────────────────────────────────────────
      if (req.method === 'GET') {
        switch (pathname) {
          case '/solution-explorer/tree': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            try {
              const tree = await buildFileTree(root, '')
              // Annotate each file with its git status letter and each directory
              // with a "modified" marker (VS Code explorer style).
              const status = getGitStatus(root)
              if (status.ok) annotateGitStatus(tree, status.value)
              json(res, { ok: true, value: tree })
            } catch (err) {
              json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
            }
            return
          }
          case '/solution-explorer/read': {
            const root = query.root || ''
            const file = query.file || ''
            if (!root || !file) { json(res, { ok: false, error: { message: 'root and file required' } }); return }
            try {
              const fullPath = pathModule.resolve(root, file)
              if (!fullPath.startsWith(pathModule.resolve(root))) {
                json(res, { ok: false, error: { message: 'path traversal denied' } }); return
              }
              const stat = await fsp.stat(fullPath)
              // Binary detection: a NUL byte in the head chunk marks a file the
              // text editor cannot display (exe, dll, images, archives, ...).
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
            return
          }
          case '/solution-explorer/search': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            try {
              json(res, { ok: true, value: await searchFiles(root, (query.q || '').toLowerCase()) })
            } catch (err) {
              json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
            }
            return
          }
          case '/solution-explorer/git-status': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            json(res, getGitStatus(root))
            return
          }
          case '/solution-explorer/git-diff': {
            const root = query.root || ''
            const file = query.file || ''
            if (!root || !file) { json(res, { ok: false, error: { message: 'root and file required' } }); return }
            const staged = query.staged === 'true'
            const args = ['diff']
            if (staged) args.push('--cached')
            args.push('--', file)
            const result = git(args, root)
            json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-log': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const result = git(['log', '--max-count=20', '--format=%H|%h|%an|%ae|%at|%s'], root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const commits = result.stdout.split('\n').filter(Boolean).map((line: string) => {
              const parts = line.split('|')
              return {
                hash: parts[0] || '', shortHash: parts[1] || '', author: parts[2] || '',
                email: parts[3] || '', timestamp: parseInt(parts[4] || '0', 10) * 1000,
                message: parts.slice(5).join('|') || '',
              }
            })
            json(res, { ok: true, value: commits })
            return
          }
        }
        json(res, { ok: false, error: { message: 'not found' } }, 404)
        return
      }

      // ── POST routes ───────────────────────────────────────────────
      if (req.method === 'POST') {
        const contentType = req.headers['content-type'] ?? ''
        if (!contentType.toLowerCase().startsWith('application/json')) {
          json(res, { ok: false, error: { message: 'content-type must be application/json' } }, 415)
          return
        }
        const payload = await readJsonBody(req)
        if (payload === null) { json(res, { ok: false, error: { message: 'malformed body' } }); return }
        const root = typeof payload.root === 'string' ? payload.root : ''
        const files = Array.isArray(payload.files) ? payload.files.filter((f): f is string => typeof f === 'string') : []

        switch (pathname) {
          case '/solution-explorer/git-stage': {
            if (!root || files.length === 0) { json(res, { ok: false, error: { message: 'root and files required' } }); return }
            const result = git(['add', '--', ...files], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-unstage': {
            if (!root || files.length === 0) { json(res, { ok: false, error: { message: 'root and files required' } }); return }
            const result = git(['reset', 'HEAD', '--', ...files], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-discard': {
            if (!root || files.length === 0) { json(res, { ok: false, error: { message: 'root and files required' } }); return }
            const result = git(['checkout', '--', ...files], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-commit': {
            const message = typeof payload.message === 'string' ? payload.message : ''
            if (!root || !message) { json(res, { ok: false, error: { message: 'root and message required' } }); return }
            const result = git(['commit', '-m', message], root)
            json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/delete': {
            const target = typeof payload.path === 'string' ? payload.path : ''
            if (!root || !target) { json(res, { ok: false, error: { message: 'root and path required' } }); return }
            try {
              const fullPath = pathModule.resolve(root, target)
              if (!fullPath.startsWith(pathModule.resolve(root))) {
                json(res, { ok: false, error: { message: 'path traversal denied' } }); return
              }
              await fsp.rm(fullPath, { recursive: true, force: true })
              json(res, { ok: true, value: true })
            } catch (err) {
              json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
            }
            return
          }
          case '/solution-explorer/write': {
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
            return
          }
        }
        json(res, { ok: false, error: { message: 'not found' } }, 404)
        return
      }

      json(res, { ok: false, error: { message: 'method not allowed' } }, 405)
    }

    const disposers = [
      ctx.webServer.register({ kind: 'prefix', path: '/solution-explorer', handler }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-solution-explorer: HTTP routes')
}

// ─── Type exports ───────────────────────────────────────────────────────────

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  mtime: number
  children?: FileTreeNode[]
  gitStatus?: string
}

export interface FileSearchResult {
  name: string
  path: string
  type: 'file' | 'directory'
}

export interface GitChange {
  path: string
  status: string
  oldPath?: string
}

export interface GitStatusData {
  staged: GitChange[]
  unstaged: GitChange[]
  untracked: GitChange[]
  ahead: number
  behind: number
  branch: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  email: string
  timestamp: number
  message: string
}

type GitEnvelope =
  | { ok: true; value: GitStatusData }
  | { ok: false; error: { message: string } }