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
export const EXPLORER_GUIDANCE = '本机已安装 dsh-solution-explorer 插件（DSH Web GUI 的右侧源代码管理面板）：项目会话打开时，聊天区右侧出现文件浏览器与源代码管理面板。能力：文件树浏览当前工作区目录（显示 git 状态标记 M/A/D/U/R），点击文件在编辑标签中查看与编辑内容（支持保存，Ctrl+S 或保存按钮），按文件名搜索；源代码管理面板显示暂存/未暂存/未跟踪变更清单，支持暂存/取消暂存/放弃变更，提交，查看差异与图形化提交历史（可查看提交详情/Checkout），支持仓库同步（抓取/拉取/推送/同步）、分支管理（切换/新建/重命名/删除/合并/发布）、远程仓库管理（添加/删除/修改地址）、非 git 目录初始化、合并冲突检测。数据源为当前会话工作目录的真实文件系统与 git 仓库，宿主进程经 /solution-explorer/* 路由提供。用户提到「右侧面板 / 文件浏览器 / 源代码管理 / 文件树 / 资源管理器 / 变更面板」时即指本插件，请据此协作。'

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

/** Remote URL shape: http(s)://, ssh://, or scp-like git@host:path. */
function isValidRemoteUrl(url: string): boolean {
  return /^(https?:\/\/|ssh:\/\/|git@[\w.-]+:)/.test(url)
}

/** Branch/tag name: no whitespace, control chars or `-` prefix (git ref rules). */
function isValidRefName(name: string): boolean {
  return name.length > 0 && !/[\s~^:?*[\\]/.test(name) && !name.startsWith('-')
}

/** Get the structured git status of a repo. */
function getGitStatus(root: string): GitEnvelope {
  if (!isGitRepo(root)) {
    return { ok: true, value: { staged: [], unstaged: [], untracked: [], conflicts: [], ahead: 0, behind: 0, branch: 'unknown' } }
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
  const conflicts: GitChange[] = []

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
      // Merge conflict states: UU AA DD AU UA DU UD — surfaced separately.
      if (st !== ' ' && us !== ' ') {
        conflicts.push({ path, status: st + us, oldPath })
        continue
      }
      if (st !== ' ') staged.push({ path, status: st, oldPath })
      if (us !== ' ') unstaged.push({ path, status: us, oldPath })
    }
  }

  return { ok: true, value: { staged, unstaged, untracked, conflicts, ahead, behind, branch } }
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
// ─── Filesystem operation helpers (paste / move / upload) ────────────────

/** Strict containment: the resolved path must be inside the workspace root. */
function ensureInside(root: string, p: string): boolean {
  const resolvedRoot = pathModule.resolve(root)
  const full = pathModule.resolve(root, p)
  return full !== resolvedRoot && full.startsWith(resolvedRoot + pathModule.sep)
}

/** Pick a non-colliding destination: append " copy" / " copy 2" while taken. */
async function autoRename(dest: string): Promise<string> {
  const exists = async (p: string) => fsp.stat(p).then(() => true).catch(() => false)
  if (!(await exists(dest))) return dest
  const dir = pathModule.dirname(dest)
  const ext = pathModule.extname(dest)
  const base = pathModule.basename(dest, ext)
  for (let i = 1; ; i++) {
    const candidate = pathModule.join(dir, `${base} copy${i > 1 ? ' ' + i : ''}${ext}`)
    if (!(await exists(candidate))) return candidate
  }
}

/** Move a path; cross-device (EXDEV) falls back to copy + remove. */
async function movePath(source: string, dest: string): Promise<void> {
  try {
    await fsp.rename(source, dest)
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
    await fsp.cp(source, dest, { recursive: true })
    await fsp.rm(source, { recursive: true, force: true })
  }
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
              const resolvedRoot = pathModule.resolve(root)
              const fullPath = pathModule.resolve(root, file)
              if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + pathModule.sep)) {
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
                    case '/solution-explorer/git-repos': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const results: { path: string; name: string; branch: string }[] = []
            const tryRepo = async (dir: string, name: string) => {
              if (await fsp.stat(pathModule.join(dir, '.git')).catch(() => null) !== null) {
                const b = git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)
                results.push({ path: dir, name, branch: b.ok ? b.stdout.trimEnd() : 'HEAD' })
              }
            }
            const resolvedRoot = pathModule.resolve(root)
            await tryRepo(resolvedRoot, pathModule.basename(resolvedRoot))
            try {
              const entries = await fsp.readdir(resolvedRoot, { withFileTypes: true })
              for (const e of entries) {
                if (e.isDirectory() && !e.name.startsWith('.')) {
                  await tryRepo(pathModule.resolve(resolvedRoot, e.name), e.name)
                }
              }
            } catch { /* ignore */ }
            json(res, { ok: true, value: results })
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
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            // Full-file contents for the side-by-side view: old = HEAD, new = index (staged) or working tree.
            const headShow = git(['show', 'HEAD:' + file], root)
            const oldContent = headShow.ok ? headShow.stdout : ''
            let newContent = ''
            if (staged) {
              const idx = git(['show', ':0:' + file], root)
              newContent = idx.ok ? idx.stdout : ''
            } else {
              try {
                newContent = await fsp.readFile(pathModule.resolve(root, file), 'utf8')
              } catch { newContent = '' }
            }
            json(res, { ok: true, value: { diff: result.stdout, oldContent, newContent } })
            return
          }
          case '/solution-explorer/git-log': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const count = Math.min(parseInt(query.count || '20', 10), 100)
            const skip = Math.max(parseInt(query.skip || '0', 10), 0)
            // --parents feeds the client-side graph lane algorithm (merge edges).
            const logArgs = ['log', `--max-count=${count}`]
            if (skip > 0) logArgs.push(`--skip=${skip}`)
            logArgs.push('--format=%H|%P|%h|%an|%ae|%at|%s')
            const result = git(logArgs, root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const commits = result.stdout.split('\n').filter(Boolean).map((line: string) => {
              const parts = line.split('|')
              return {
                hash: parts[0] || '', parents: (parts[1] || '').split(' ').filter(Boolean),
                shortHash: parts[2] || '', author: parts[3] || '',
                email: parts[4] || '', timestamp: parseInt(parts[5] || '0', 10) * 1000,
                message: parts.slice(6).join('|') || '',
              }
            })
            // Unpushed (outgoing) commits: HEAD commits not yet on the upstream.
            // Without an upstream, everything is local-only → all unpushed.
            const upstreamLog = git(['log', '--format=%H', '@{upstream}..HEAD'], root)
            let unpushedSet: Set<string>
            if (upstreamLog.ok) {
              unpushedSet = new Set(upstreamLog.stdout.split('\n').filter(Boolean))
            } else {
              unpushedSet = new Set(commits.map((c) => c.hash))
            }
            for (const c of commits) (c as { unpushed?: boolean }).unpushed = unpushedSet.has(c.hash)
            json(res, { ok: true, value: commits })
            return
          }
          case '/solution-explorer/git-remotes': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const result = git(['remote', '-v'], root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const remotes = result.stdout.split('\n').filter(Boolean).map((line: string) => {
              const m = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/)
              return m ? { name: m[1], url: m[2], type: m[3] } : null
            }).filter((r): r is { name: string; url: string; type: string } => r !== null)
            json(res, { ok: true, value: remotes })
            return
          }
          case '/solution-explorer/git-branches': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            // Full refname (refs/heads/* vs refs/remotes/*) so local and remote
            // branches are distinguishable — %(refname:short) collapses both to
            // "name"/"origin/name" and the remote rows were mis-sorted.
            const result = git(['branch', '-a', '--format=%(HEAD)|%(refname)|%(upstream:short)|%(objectname:short)|%(subject)'], root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const branches = result.stdout.split('\n').filter(Boolean).map((line: string) => {
              const parts = line.split('|')
              const ref = parts[1] || ''
              let name = ''
              let isRemote = false
              if (ref.startsWith('refs/remotes/')) { name = ref.slice('refs/remotes/'.length); isRemote = true }
              else if (ref.startsWith('refs/heads/')) name = ref.slice('refs/heads/'.length)
              else return null // detached-HEAD row (no refname) — never a clickable branch
              if (name.endsWith('/HEAD')) return null // origin/HEAD is a symref pointer, not a branch
              return {
                current: parts[0] === '*', name, isRemote,
                upstream: parts[2] || '', shortHash: parts[3] || '',
                subject: parts.slice(4).join('|') || '',
              }
            }).filter((b): b is NonNullable<typeof b> => b !== null)
            json(res, { ok: true, value: branches })
            return
          }
          case '/solution-explorer/git-tags': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            // Tag name, tag object hash, dereferenced commit hash and commit subject.
            const result = git(['for-each-ref', 'refs/tags', '--sort=-creatordate', '--format=%(refname:short)|%(objectname:short)|%(*objectname:short)|%(*subject)'], root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const tags = result.stdout.split('\n').filter(Boolean).map((line: string) => {
              const parts = line.split('|')
              return {
                name: parts[0] || '', hash: parts[1] || '',
                commitHash: parts[2] || '', subject: parts.slice(3).join('|') || '',
              }
            })
            json(res, { ok: true, value: tags })
            return
          }
          case '/solution-explorer/git-commit-detail': {
            const root = query.root || ''
            const hash = query.hash || ''
            if (!root || !hash) { json(res, { ok: false, error: { message: 'root and hash required' } }); return }
            const result = git(['show', '--name-only', '--format=%H|%P|%h|%an|%ae|%at|%s', hash], root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const lines = result.stdout.split('\n')
            const head = lines[0] || ''
            const parts = head.split('|')
            const files = lines.slice(1).filter(Boolean)
            json(res, {
              ok: true,
              value: {
                hash: parts[0] || '', parents: (parts[1] || '').split(' ').filter(Boolean),
                shortHash: parts[2] || '', author: parts[3] || '',
                email: parts[4] || '', timestamp: parseInt(parts[5] || '0', 10) * 1000,
                message: parts.slice(6).join('|') || '', files,
              },
            })
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
          case '/solution-explorer/paste': {
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
            return
          }
          case '/solution-explorer/move': {
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
            return
          }
          case '/solution-explorer/upload': {
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
            return
          }
          case '/solution-explorer/create': {
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
            return
          }
          case '/solution-explorer/git-init': {
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            if (isGitRepo(root)) { json(res, { ok: false, error: { message: '已经是 Git 仓库' } }); return }
            const result = git(['init'], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-fetch': {
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const result = git(['fetch'], root)
            json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-pull': {
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const headRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
            if (headRef.ok && headRef.stdout === 'HEAD') {
              json(res, { ok: false, error: { message: '当前不在任何分支上（detached HEAD），请先在分支面板切换到分支再拉取' } }); return
            }
            const result = git(['pull'], root)
            json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-push': {
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const headRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
            if (headRef.ok && headRef.stdout === 'HEAD') {
              json(res, { ok: false, error: { message: '当前不在任何分支上（detached HEAD），请先在分支面板切换到分支再推送' } }); return
            }
            const result = git(['push'], root)
            json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-sync': {
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            const headRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
            if (headRef.ok && headRef.stdout === 'HEAD') {
              json(res, { ok: false, error: { message: '当前不在任何分支上（detached HEAD），请先在分支面板切换到分支再同步' } }); return
            }
            // VS Code "Sync Changes": pull first, then push; a failed pull stops.
            const pull = git(['pull'], root)
            if (!pull.ok) { json(res, { ok: false, error: { message: pull.error } }); return }
            const push = git(['push'], root)
            json(res, push.ok ? { ok: true, value: push.stdout } : { ok: false, error: { message: push.error } })
            return
          }
          case '/solution-explorer/git-remote-add': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            const remoteUrl = typeof payload.url === 'string' ? payload.url : ''
            if (!root || !name || !remoteUrl) { json(res, { ok: false, error: { message: 'root, name and url required' } }); return }
            if (!isValidRefName(name) || !isValidRemoteUrl(remoteUrl)) {
              json(res, { ok: false, error: { message: '远程名称或 URL 格式无效' } }); return
            }
            const result = git(['remote', 'add', name, remoteUrl], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-remote-remove': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
            if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'invalid remote name' } }); return }
            const result = git(['remote', 'remove', name], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-remote-set-url': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            const remoteUrl = typeof payload.url === 'string' ? payload.url : ''
            if (!root || !name || !remoteUrl) { json(res, { ok: false, error: { message: 'root, name and url required' } }); return }
            if (!isValidRefName(name) || !isValidRemoteUrl(remoteUrl)) {
              json(res, { ok: false, error: { message: '远程名称或 URL 格式无效' } }); return
            }
            const result = git(['remote', 'set-url', name, remoteUrl], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-branch-create': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            const from = typeof payload.from === 'string' && payload.from ? payload.from : ''
            if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
            if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
            const args = ['branch', name]
            if (from) { if (!isValidRefName(from)) { json(res, { ok: false, error: { message: 'invalid from ref' } }); return } args.push(from) }
            const result = git(args, root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-branch-checkout': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            const track = payload.track === true
            if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
            if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '引用名称无效' } }); return }
            // Refuse to switch while the working tree is dirty — git would risk
            // overwriting uncommitted changes with a cryptic error.
            const dirty = git(['status', '--porcelain'], root)
            if (dirty.ok && dirty.stdout.trimEnd() !== '') {
              json(res, { ok: false, error: { message: '工作区有未提交的更改，请先提交或放弃后再切换分支' } }); return
            }
            // Remote branch click (track=true): create a local tracking branch
            // instead of detaching HEAD — VS Code style checkout.
            if (!track) {
              const result = git(['checkout', name], root)
              json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
              return
            }
            // Remote-branch checkout: resolve origin/HEAD to its target, then
            // reuse an existing local branch instead of failing with --track.
            let target = name
            if (target.endsWith('/HEAD')) {
              const sym = git(['symbolic-ref', '--short', 'refs/remotes/' + target], root)
              if (!sym.ok) { json(res, { ok: false, error: { message: '无法解析 ' + target } }); return }
              target = sym.stdout.trimEnd()
            }
            const short = target.includes('/') ? target.slice(target.indexOf('/') + 1) : target
            if (short === 'HEAD' || !isValidRefName(short)) {
              json(res, { ok: false, error: { message: '分支名称无效' } }); return
            }
            const localExists = git(['rev-parse', '--verify', '--quiet', 'refs/heads/' + short], root).ok
            const args = localExists ? ['checkout', short] : ['checkout', '--track', target]
            const result = git(args, root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-branch-delete': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            const force = payload.force === true
            if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
            if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
            const result = git(['branch', force ? '-D' : '-d', name], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-branch-rename': {
            const oldName = typeof payload.oldName === 'string' ? payload.oldName : ''
            const newName = typeof payload.newName === 'string' ? payload.newName : ''
            if (!root || !oldName || !newName) { json(res, { ok: false, error: { message: 'root, oldName and newName required' } }); return }
            if (!isValidRefName(oldName) || !isValidRefName(newName)) {
              json(res, { ok: false, error: { message: '分支名称无效' } }); return
            }
            const result = git(['branch', '-m', oldName, newName], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-branch-merge': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
            if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
            const result = git(['merge', name], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
            return
          }
          case '/solution-explorer/git-branch-publish': {
            const name = typeof payload.name === 'string' ? payload.name : ''
            if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
            if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
            const result = git(['push', '-u', 'origin', name], root)
            json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
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
  conflicts: GitChange[]
  ahead: number
  behind: number
  branch: string
}

export interface GitCommit {
  hash: string
  parents: string[]
  shortHash: string
  author: string
  email: string
  timestamp: number
  message: string
}

type GitEnvelope =
  | { ok: true; value: GitStatusData }
  | { ok: false; error: { message: string } }