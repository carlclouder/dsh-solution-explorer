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
import type { Readable } from 'node:stream'

/** Plugin configuration schema (all optional with defaults). */
export interface Config {
  /** Default panel width in px (264-420; dragging may widen it further). */
  defaultWidth?: number
  /** Whether to auto-open the panel when a session activates. */
  autoOpen?: boolean
  /** Glob patterns to hide from the file tree. */
  filterPatterns?: string[]
  /** Whether to show dot-prefixed (hidden) files in the tree. */
  showHidden?: boolean
  /** Default shell for embedded terminals (pwsh / powershell / cmd / bash…). */
  terminalShell?: string
  /** Max terminal tabs before the "+" button refuses new sessions. */
  terminalMaxTabs?: number
  /** Initial bottom-terminal panel height in px. */
  terminalHeight?: number
  /** Max bottom-terminal panel height in px (drag limit). */
  terminalMaxHeight?: number
}

export const Config: z<Config> = z.object({
  defaultWidth: z.number().step(1).min(264).max(420).default(280),
  autoOpen: z.boolean().default(true),
  filterPatterns: z.array(z.string()).default([]),
  showHidden: z.boolean().default(false),
  terminalShell: z.string().default(''),
  terminalMaxTabs: z.number().step(1).min(2).max(16).default(8),
  terminalHeight: z.number().step(1).min(120).max(480).default(400),
  terminalMaxHeight: z.number().step(1).min(240).max(1080).default(1000),
})

// ─── Embedded terminal (ConPTY via the dsh subprocess service) ──────────────

/** Structural views of the dsh-subprocess terminal contract. The service is
 *  obtained at runtime through ctx.get('subprocess'); these local shapes keep
 *  the host half free of a hard dependency on @deepseek-ai/dsh-subprocess. */
interface PtyHandleLike {
  readonly pid: number
  readonly output: Readable
  readonly done: Promise<unknown>
  write(data: string): Promise<void>
  terminate(): Promise<void>
}

interface SubprocessServiceLike {
  spawnTerminal(spec: {
    argv: readonly string[]
    cwd: string
    rows: number
    cols: number
    graceMs: number
    signal?: AbortSignal
  }): Promise<PtyHandleLike>
  /** Resolve a bare command name to an absolute path (required by spawnTerminal). */
  resolveExecutable?(command: string): Promise<string>
}

interface TerminalSession {
  id: string
  cwd: string
  shell: string
  handle: PtyHandleLike
  streaming: boolean
  /** Detaches this session's output sink from the shared stream hub. */
  bound?: (() => void) | null
}

/** One multiplexed terminal output frame pushed through the shared SSE stream. */
interface TermChunk {
  id: string
  data?: string
  end?: boolean
}

/** True when `target` resolves inside `root` (or equals it). */
function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = pathModule.resolve(root)
  const fullPath = pathModule.resolve(target)
  return fullPath === resolvedRoot || fullPath.startsWith(resolvedRoot + pathModule.sep)
}

/** Required services: the route registry, the workspace registry, and the prompt band. */
export const inject = ['webServer', 'workspaceRegistry', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210

/** Model-facing announcement. */
export const EXPLORER_GUIDANCE = '本机已安装 dsh-solution-explorer 插件（DSH Web GUI 的右侧源代码管理面板）：项目会话打开时，聊天区右侧出现文件浏览器与源代码管理面板。能力：文件树浏览当前工作区目录（显示 git 状态标记 M/A/D/U/R），点击文件在编辑标签中查看与编辑内容（支持保存，Ctrl+S 或保存按钮），按文件名搜索；源代码管理面板显示暂存/未暂存/未跟踪变更清单，支持暂存/取消暂存/放弃变更，提交，查看差异与图形化提交历史（可查看提交详情/Checkout），支持仓库同步（抓取/拉取/推送/同步）、分支管理（切换/新建/重命名/删除/合并/发布）、远程仓库管理（添加/删除/修改地址）、非 git 目录初始化、合并冲突检测。设置侧边栏的「资源管理器」页可调整插件个性化设置（面板宽度、自动打开、过滤模式）。内置多标签终端：折叠窄条（rail）中的终端图标可展开底部终端面板（DSH 原生 ConPTY，默认 pwsh/cmd），关闭标签或断线自动清理进程；用户提到终端时可用它执行命令。数据源为当前会话工作目录的真实文件系统与 git 仓库，宿主进程经 /solution-explorer/* 路由提供。用户提到「右侧面板 / 文件浏览器 / 源代码管理 / 文件树 / 资源管理器 / 变更面板」时即指本插件，请据此协作。'

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

/** Image extensions the editor can preview (served raw via /raw). */
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

function imageMime(ext: string): string {
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'svg': return 'image/svg+xml'
    case 'ico': return 'image/x-icon'
    default: return 'image/' + ext
  }
}

/** Get the structured git status of a repo. */
function getGitStatus(root: string): GitEnvelope {
  if (!isGitRepo(root)) {
    return { ok: true, value: { staged: [], unstaged: [], untracked: [], conflicts: [], ignored: [], ahead: 0, behind: 0, branch: 'unknown', head: '' } }
  }
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
  const branch = branchResult.ok ? branchResult.stdout : 'HEAD'
  // Full HEAD hash lets the client detect external commits/checkouts so the
  // commit history can auto-refresh after a command-line `git commit`.
  const headResult = git(['rev-parse', 'HEAD'], root)
  const head = headResult.ok ? headResult.stdout : ''

  const aheadBehind = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], root)
  let ahead = 0, behind = 0
  if (aheadBehind.ok) {
    const parts = aheadBehind.stdout.split('\t')
    ahead = parseInt(parts[0] || '0', 10)
    behind = parseInt(parts[1] || '0', 10)
  }

  // --ignored=matching lists ignored paths one level deep (an ignored directory
  // is a single "!! dir/" line, never expanded) so the explorer can grey them.
  // core.quotePath=false keeps paths with spaces/UTF-8 unquoted — porcelain
  // v1 otherwise wraps them in C-style quotes and the parsed path breaks
  // stage/discard for files like "AGENTS copy.md".
  let statusResult = git(['-c', 'core.quotePath=false', 'status', '--porcelain', '-u', '--ignored=matching'], root)
  if (!statusResult.ok && /ignored|unknown option|usage/i.test(statusResult.error)) {
    statusResult = git(['-c', 'core.quotePath=false', 'status', '--porcelain', '-u'], root)
  }
  const staged: GitChange[] = []
  const unstaged: GitChange[] = []
  const untracked: GitChange[] = []
  const conflicts: GitChange[] = []
  const ignored: GitChange[] = []

  if (statusResult.ok && statusResult.stdout) {
    const lines = statusResult.stdout.split('\n')
    for (const line of lines) {
      if (line.length < 3) continue
      const st = line[0]
      const us = line[1]
      const filePath = unquoteGitPath(line.substring(3).trim())
      const match = filePath.match(/^(.+?)\s+->\s+(.+)$/)
      const path = match ? unquoteGitPath(match[2].trim()) : filePath
      const oldPath = match ? unquoteGitPath(match[1].trim()) : undefined

      if (st === '!' && us === '!') {
        ignored.push({ path, status: '!' })
        continue
      }

      if (st === '?' && us === '?') {
        untracked.push({ path, status: '?' })
        continue
      }
      // Merge conflict states are exactly UU AA DD AU UA DU UD — a plain
      // two-column entry like MM (partially staged) must NOT be treated as a
      // conflict, it stays staged + unstaged below.
      if (st === 'U' || us === 'U' || (st === 'A' && us === 'A') || (st === 'D' && us === 'D')) {
        conflicts.push({ path, status: st + us, oldPath })
        continue
      }
      if (st !== ' ') staged.push({ path, status: st, oldPath })
      if (us !== ' ') unstaged.push({ path, status: us, oldPath })
    }
  }

  return { ok: true, value: { staged, unstaged, untracked, conflicts, ignored, ahead, behind, branch, head } }
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

/** True when a file name matches any configured filter pattern (glob-ish). */
function matchesFilter(name: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false
  return patterns.some((p) => {
    const trimmed = p.trim()
    if (trimmed === '') return false
    // * matches any run of chars, ? a single char; otherwise substring match.
    if (trimmed.includes('*') || trimmed.includes('?')) {
      const re = new RegExp('^' + trimmed.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
      return re.test(name)
    }
    return name.includes(trimmed)
  })
}

async function buildFileTree(root: string, relativePath: string, filterPatterns: string[] = [], showHidden = false): Promise<FileTreeNode> {
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
      // Hidden dot-files are skipped unless showHidden; .git stays hidden
      // either way (git internals are never tree material).
      .filter(e => (showHidden || !e.name.startsWith('.')) && e.name !== 'node_modules' && e.name !== '.git' && !matchesFilter(e.name, filterPatterns))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
    node.children = []
    for (const entry of sorted) {
      const childRel = relativePath ? pathModule.join(relativePath, entry.name) : entry.name
      try {
        node.children.push(await buildFileTree(root, childRel, filterPatterns, showHidden))
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
 * Decode a git C-style quoted pathname (porcelain v1 always quotes paths that
 * contain spaces or other special characters, regardless of core.quotePath).
 * Non-quoted input is returned unchanged.
 */
function unquoteGitPath(s: string): string {
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') return s
  const inner = s.slice(1, -1)
  let out = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch !== '\\') { out += ch; continue }
    const n = inner[i + 1]
    if (n === undefined) break
    i++
    switch (n) {
      case 'a': out += '\x07'; break
      case 'b': out += '\b'; break
      case 't': out += '\t'; break
      case 'n': out += '\n'; break
      case 'v': out += '\v'; break
      case 'f': out += '\f'; break
      case 'r': out += '\r'; break
      case '"': out += '"'; break
      case '\\': out += '\\'; break
      default:
        if (n >= '0' && n <= '7') {
          // A run of octal escapes encodes one UTF-8 sequence (e.g. "\346\265\213");
          // collect the bytes and decode once.
          const bytes: number[] = []
          let oct = n
          let k = 1
          while (k < 3 && i + 1 < inner.length && inner[i + 1] >= '0' && inner[i + 1] <= '7') {
            oct += inner[i + 1]; i++; k++
          }
          bytes.push(parseInt(oct, 8))
          while (bytes.length < 16 && inner[i + 1] === '\\' && inner[i + 2] >= '0' && inner[i + 2] <= '7') {
            let oct2 = inner[i + 2]
            let k2 = 1
            i += 2
            while (k2 < 3 && i + 1 < inner.length && inner[i + 1] >= '0' && inner[i + 1] <= '7') {
              oct2 += inner[i + 1]; i++; k2++
            }
            bytes.push(parseInt(oct2, 8))
          }
          out += Buffer.from(bytes).toString('utf-8')
        } else {
          out += n
        }
    }
  }
  return out
}

/**
 * Annotate each file node with its git status letter (M/A/D/R/U/?) or an
 * ignored marker ('!'), and each directory with 'M' when any descendant has
 * changes, '!' when it is itself excluded, otherwise undefined — VS Code style.
 * @param node - the tree node to annotate.
 * @param status - the repository git status (staged + unstaged + untracked + ignored).
 * @returns whether this node (or any descendant) has a change.
 */
function annotateGitStatus(node: FileTreeNode, status: GitStatusData): boolean {
  // Git may report a directory as "dir/" while tree nodes never carry the
  // trailing slash, so strip it before matching.
  const norm = (p: string) => normPath(p).replace(/\/+$/, '')
  const map = new Map<string, string>()
  for (const c of [...status.staged, ...status.unstaged, ...status.untracked]) {
    if (!map.has(norm(c.path))) map.set(norm(c.path), c.status)
  }
  // Conflicts (UU/AA/DD/...) collapse to a single 'U' marker, matching the
  // SCM badge, so the tree and the change panel agree on conflicted files.
  for (const c of status.conflicts) {
    if (!map.has(norm(c.path))) map.set(norm(c.path), 'U')
  }
  const ignoredSet = new Set(status.ignored.map((c) => norm(c.path)))
  // Git reports an ignored directory as a single "!! dir/" line and never
  // expands its contents, so inherit the ignored state down the tree:
  // everything under an excluded directory is greyed too, unless a tracked
  // change (e.g. a force-added file) overrides the marker.
  const walk = (n: FileTreeNode, parentIgnored: boolean): boolean => {
    const key = norm(n.path)
    const selfIgnored = parentIgnored || ignoredSet.has(key)
    if (n.type === 'file') {
      n.gitStatus = map.get(key) ?? (selfIgnored ? '!' : undefined)
      return n.gitStatus !== undefined && n.gitStatus !== '!'
    }
    let hasChanges = false
    for (const child of n.children ?? []) {
      if (walk(child, selfIgnored)) hasChanges = true
    }
    // A change anywhere beats an "ignored" marker; an ignored directory with
    // no changes shows grey ('!') so excluded folders read at a glance.
    n.gitStatus = hasChanges ? 'M' : selfIgnored ? '!' : undefined
    return hasChanges
  }
  walk(node, false)
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
  // Settings-page persistence: the `settings` service (when mounted) must be
  // registered before reads/writes work — an unregistered namespace makes get()
  // return undefined and update() throw. Registering with the bundle row as the
  // `base` layer resolves: schema defaults → bundle config → user document.
  const settings = ctx.get('settings') as
    | {
        register<T>(ns: string, schema: z<Config>, options?: { base?: Partial<T> }): {
          get(): T
          update(patch: object): Promise<void>
        }
      }
    | undefined
  let settingsScope: { get(): Config; update(patch: object): Promise<void> } | undefined
  let effectiveConfig: Config = { ...config }
  if (settings) {
    try {
      settingsScope = settings.register('solution-explorer', Config, { base: config })
      effectiveConfig = settingsScope.get()
    } catch { /* unregistered or invalid stored section — keep bundle defaults */ }
  }

  // ── Embedded terminal sessions (ConPTY through the dsh subprocess service) ──
  const terminals = new Map<string, TerminalSession>()
  let terminalSeq = 0
  // Well-known absolute shell locations: node-pty cannot spawn bare PATH names
  // (ConPTY CreateProcess fails with "File not found: " even for cmd), so every
  // candidate the plugin tries is resolved to an existing absolute path first.
  const windowsShellPaths = (): string[] => {
    const list: string[] = []
    const push = (p: string | undefined): void => { if (p) list.push(p) }
    if (process.env.LOCALAPPDATA) push(pathModule.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe'))
    push(pathModule.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'))
    push('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    push(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe')
    return list
  }
  const posixShellPaths = (): string[] => [process.env.SHELL || '/bin/bash', '/bin/bash', '/bin/sh']
  const resolveShellCandidates = async (shell: string | undefined): Promise<string[][]> => {
    const s = (shell || '').trim()
    const pools: string[] = []
    if (process.platform === 'win32') {
      pools.push(...windowsShellPaths())
      if (s) {
        const abs = (name: string): void => {
          const table: Record<string, string[]> = {
            'pwsh': [process.env.LOCALAPPDATA ? pathModule.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe') : '', pathModule.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe')],
            'powershell': ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'],
            'cmd': [process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'],
          }
          const mapped = table[name.toLowerCase()]
          if (mapped) pools.push(...mapped)
          else pools.push(name)
        }
        if (pathModule.isAbsolute(s)) pools.push(s)
        else { for (const part of s.split(/\s+/)) abs(part) }
      }
    } else {
      pools.push(...posixShellPaths())
      if (s) {
        if (pathModule.isAbsolute(s)) pools.push(s)
        else pools.push(s === 'bash' ? '/bin/bash' : s)
      }
    }
    const seen = new Set<string>()
    const out: string[][] = []
    for (const p of pools) {
      const clean = p.trim()
      if (!clean || seen.has(clean)) continue
      seen.add(clean)
      if (pathModule.isAbsolute(clean)) {
        try { await fsp.access(clean) } catch { continue } // missing file: skip
      }
      out.push([clean])
    }
    return out
  }
  // Shared output hub: ONE SSE connection carries every session's output
  // (browsers cap concurrent HTTP/1.1 connections per origin, so per-tab
  // streams would starve after ~3 terminals).
  const termListeners = new Set<(m: TermChunk) => void>()
  const termPush = (m: TermChunk): void => {
    for (const fn of termListeners) {
      try { fn(m) } catch { /* listener failure must not break the hub */ }
    }
  }
  const attachSessionSink = (session: TerminalSession): (() => void) => {
    const output = session.handle.output
    const onData = (chunk: Buffer | string): void => {
      const data = Buffer.isBuffer(chunk) ? chunk.toString('base64') : Buffer.from(String(chunk)).toString('base64')
      termPush({ id: session.id, data })
    }
    const onEnd = (): void => { termPush({ id: session.id, end: true }) }
    output.on('data', onData)
    output.on('end', onEnd)
    return () => {
      output.off('data', onData)
      output.off('end', onEnd)
    }
  }
  let terminalStreamOn = false

  const terminalSupported = (): boolean => {
    const sub = ctx.get('subprocess') as SubprocessServiceLike | undefined
    return !!sub && typeof sub.spawnTerminal === 'function'
  }
  const spawnTerminalSession = async (cwd: string, shell: string | undefined, rows: number, cols: number): Promise<TerminalSession> => {
    const sub = ctx.get('subprocess') as SubprocessServiceLike | undefined
    if (!sub || typeof sub.spawnTerminal !== 'function') throw new Error('subprocess service unavailable')
    const candidates = await resolveShellCandidates(shell)
    let lastError: unknown
    for (const argv of candidates) {
      try {
        const handle = await sub.spawnTerminal({ argv, cwd, rows, cols, graceMs: 2000 })
        const id = 't' + (++terminalSeq).toString(36) + Math.random().toString(36).slice(2, 6)
        const session: TerminalSession = { id, cwd, shell: argv.join(' '), handle, streaming: false }
        terminals.set(id, session)
        session.bound = attachSessionSink(session)
        return session
      } catch (err) { lastError = err }
    }
    throw lastError instanceof Error ? lastError : new Error('terminal spawn failed')
  }
  const killSession = (id: string): void => {
    const session = terminals.get(id)
    if (!session) return
    if (session.bound) { session.bound(); session.bound = undefined }
    terminals.delete(id)
    void session.handle.terminate().catch(() => { /* session already gone */ })
  }

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
        // ── Terminal output: ONE shared SSE stream for every session ──
        // A single long-lived connection multiplexes all terminals, so the
        // browser's per-origin connection pool is never exhausted by tabs.
        if (pathname === '/solution-explorer/terminal/stream') {
          if (terminalStreamOn) { json(res, { ok: false, error: { message: 'terminal stream already open' } }, 409); return }
          terminalStreamOn = true
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
          res.write(':ok\n\n')
          const onMsg = (m: TermChunk): void => {
            if (!res.writable) return
            if (m.end) res.write(`event: end\ndata: ${m.id}\n\n`)
            else res.write(`event: t\ndata: ${m.id}|${m.data}\n\n`)
          }
          termListeners.add(onMsg)
          const cleanup = (): void => {
            termListeners.delete(onMsg)
            terminalStreamOn = false
            // Disconnect policy: the page that owned the terminals is gone —
            // kill every session so no shell outlives it.
            for (const s of [...terminals.values()]) killSession(s.id)
          }
          res.on('close', cleanup)
          return
        }
        switch (pathname) {
          case '/solution-explorer/tree': {
            const root = query.root || ''
            if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
            try {
              const tree = await buildFileTree(root, '', effectiveConfig.filterPatterns, !!effectiveConfig.showHidden)
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
          case '/solution-explorer/settings': {
            json(res, { ok: true, value: effectiveConfig })
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
            return
          }
          case '/solution-explorer/raw': {
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
            // Binary diffs ("Binary files a/x and b/x differ") cannot be shown in
            // the text diff view — report unsupported so the UI can say so
            // instead of rendering garbled bytes (consistent with the editor).
            if (/^Binary files .* differ$/m.test(result.stdout)) {
              json(res, { ok: true, value: { unsupported: true } })
              return
            }
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
            // One call carries both the per-file status letters (M/A/D, and
            // rename/copy rows carry "old<TAB>new") and the shortstat summary
            // line for the tooltip ("N files changed, X insertions(+), Y deletions(-)").
            const result = git(['show', '--name-status', '--shortstat', '--format=%H|%P|%h|%an|%ae|%at|%s', hash], root)
            if (!result.ok) { json(res, { ok: false, error: { message: result.error } }); return }
            const lines = result.stdout.split('\n')
            const head = lines[0] || ''
            const parts = head.split('|')
            // Paths with spaces are quoted by git ("AGENTS copy.md") — decode
            // them so the list matches the tree/SCM path display.
            const files: Array<{ status: string; path: string; oldPath?: string }> = []
            const stats = { files: 0, insertions: 0, deletions: 0 }
            for (const line of lines.slice(1)) {
              const trimmed = line.trim()
              if (!trimmed) continue
              const statMatch = trimmed.match(/^(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?$/)
              if (statMatch) {
                stats.files = parseInt(statMatch[1], 10)
                stats.insertions = parseInt(statMatch[2] || '0', 10)
                stats.deletions = parseInt(statMatch[3] || '0', 10)
                continue
              }
              const segs = trimmed.split('\t')
              if (segs.length < 2) continue
              const status = (segs[0] || 'M').slice(0, 1)
              if (segs.length >= 3 && /^(R|C)/.test(segs[0])) {
                // Rename/copy: "R100<TAB>old<TAB>new" — keep both paths.
                files.push({ status, path: unquoteGitPath(segs[2]), oldPath: unquoteGitPath(segs[1]) })
              } else {
                files.push({ status, path: unquoteGitPath(segs[1]) })
              }
            }
            // Full message (subject + body) for the hover tooltip.
            const bodyResult = git(['show', '-s', '--format=%B', hash], root)
            json(res, {
              ok: true,
              value: {
                hash: parts[0] || '', parents: (parts[1] || '').split(' ').filter(Boolean),
                shortHash: parts[2] || '', author: parts[3] || '',
                email: parts[4] || '', timestamp: parseInt(parts[5] || '0', 10) * 1000,
                message: parts.slice(6).join('|') || '',
                body: bodyResult.ok ? bodyResult.stdout.replace(/\n+$/, '') : '',
                files, stats,
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
          case '/solution-explorer/settings': {
            const next: Config = { ...effectiveConfig }
            if (typeof payload.defaultWidth === 'number' && payload.defaultWidth >= 264 && payload.defaultWidth <= 420) next.defaultWidth = payload.defaultWidth
            if (typeof payload.autoOpen === 'boolean') next.autoOpen = payload.autoOpen
            if (typeof payload.showHidden === 'boolean') next.showHidden = payload.showHidden
            if (typeof payload.terminalShell === 'string') next.terminalShell = payload.terminalShell
            if (typeof payload.terminalMaxTabs === 'number') next.terminalMaxTabs = Math.min(16, Math.max(2, Math.floor(payload.terminalMaxTabs)))
            if (typeof payload.terminalHeight === 'number') next.terminalHeight = Math.min(480, Math.max(120, Math.floor(payload.terminalHeight)))
            if (typeof payload.terminalMaxHeight === 'number') next.terminalMaxHeight = Math.min(1080, Math.max(240, Math.floor(payload.terminalMaxHeight)))
            if (Array.isArray(payload.filterPatterns)) next.filterPatterns = payload.filterPatterns.filter((x): x is string => typeof x === 'string')
            const parsed = Config(next)
            effectiveConfig = parsed
            if (settingsScope) {
              try { await settingsScope.update(parsed) } catch { /* persistence failure is non-fatal */ }
            }
            json(res, { ok: true, value: parsed })
            return
          }
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
          case '/solution-explorer/rename': {
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
          case '/solution-explorer/terminal': {
            const cwd = typeof payload.cwd === 'string' ? payload.cwd : ''
            if (!root || !cwd) { json(res, { ok: false, error: { message: 'root and cwd required' } }); return }
            if (!isPathInside(root, cwd)) { json(res, { ok: false, error: { message: 'cwd outside workspace' } }); return }
            if (!terminalSupported()) { json(res, { ok: false, code: 'unsupported', error: { message: 'subprocess service unavailable' } }); return }
            const rows = Math.min(120, Math.max(5, typeof payload.rows === 'number' ? Math.floor(payload.rows) : 24))
            const cols = Math.min(400, Math.max(20, typeof payload.cols === 'number' ? Math.floor(payload.cols) : 80))
            try {
              const session = await spawnTerminalSession(cwd, typeof payload.shell === 'string' ? payload.shell : effectiveConfig.terminalShell, rows, cols)
              json(res, { ok: true, value: { id: session.id, shell: session.shell } })
            } catch (err) {
              json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
            }
            return
          }
          default: {
            const inputMatch = /^\/solution-explorer\/terminal\/([^/]+)\/input$/.exec(pathname)
            if (inputMatch) {
              const session = terminals.get(inputMatch[1])
              if (!session) { json(res, { ok: false, error: { message: 'terminal not found' } }, 404); return }
              const data = typeof payload.data === 'string' ? payload.data : ''
              await session.handle.write(data)
              json(res, { ok: true, value: true })
              return
            }
            const rebootMatch = /^\/solution-explorer\/terminal\/([^/]+)\/reboot$/.exec(pathname)
            if (rebootMatch) {
              const session = terminals.get(rebootMatch[1])
              if (!session) { json(res, { ok: false, error: { message: 'terminal not found' } }, 404); return }
              const rows = Math.min(120, Math.max(5, typeof payload.rows === 'number' ? Math.floor(payload.rows) : 24))
              const cols = Math.min(400, Math.max(20, typeof payload.cols === 'number' ? Math.floor(payload.cols) : 80))
              try {
                if (session.bound) { session.bound(); session.bound = undefined }
                await session.handle.terminate()
                const next = await spawnTerminalSession(session.cwd, session.shell, rows, cols)
                // Re-key to the original tab id and rebind the output sink to it
                // (the fresh spawn attached its sink under its temporary id).
                terminals.delete(next.id)
                next.id = session.id
                if (next.bound) next.bound()
                next.bound = attachSessionSink(next)
                next.streaming = false
                terminals.set(session.id, next)
                json(res, { ok: true, value: true })
              } catch (err) {
                json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
              }
              return
            }
            json(res, { ok: false, error: { message: 'not found' } }, 404)
            return
          }
        }
        json(res, { ok: false, error: { message: 'not found' } }, 404)
        return
      }

      // ── DELETE routes ─────────────────────────────────────────────
      if (req.method === 'DELETE') {
        const deleteMatch = /^\/solution-explorer\/terminal\/([^/]+)$/.exec(pathname)
        if (deleteMatch) {
          const session = terminals.get(deleteMatch[1])
          if (!session) { json(res, { ok: false, error: { message: 'terminal not found' } }, 404); return }
          killSession(deleteMatch[1])
          json(res, { ok: true, value: true })
          return
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

  // Host teardown / profile reload: every terminal session is killed so no
  // shell process outlives the plugin.
  ctx.effect(() => {
    return () => {
      for (const session of terminals.values()) {
        void session.handle.terminate().catch(() => { /* host teardown */ })
      }
      terminals.clear()
    }
  }, 'dsh-solution-explorer: terminal teardown')
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
  ignored: GitChange[]
  ahead: number
  behind: number
  branch: string
  head: string
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