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
import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'
import type { Readable } from 'node:stream'

import { isPathInside } from './host/paths.ts'
import { json, readJsonBody, parseQuery } from './host/http-util.ts'
import { SECTION_ORDER, EXPLORER_GUIDANCE } from './host/prompt.ts'
import { Config } from './host/config.ts'
import { getRoutes, postRoutes } from './host/routes/index.ts'

export { Config } from './host/config.ts'
export { EXPLORER_GUIDANCE } from './host/prompt.ts'

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

/** Required services: the route registry, the workspace registry, and the prompt band. */
export const inject = ['webServer', 'workspaceRegistry', 'systemPrompt']

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

      // Build the per-request route context. The apply-closure dependencies
      // (effective config + settings persistence) are injected as closures;
      // terminal routes below still read the apply-scope terminal state directly.
      const routeCtx = (over: { payload?: Record<string, unknown>; root?: string; files?: string[] } = {}) => ({
        res,
        pathname,
        query,
        payload: over.payload ?? {},
        root: over.root ?? '',
        files: over.files ?? [],
        getConfig: (): Config => effectiveConfig,
        setConfig: (next: Config): void => { effectiveConfig = next },
        persist: async (next: Config): Promise<void> => {
          if (settingsScope) {
            try { await settingsScope.update(next) } catch { /* persistence failure is non-fatal */ }
          }
        },
      })

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
        const getHandler = getRoutes[pathname]
        if (getHandler) { await getHandler(routeCtx()); return }
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

        const postHandler = postRoutes[pathname]
        if (postHandler) { await postHandler(routeCtx({ payload, root, files })); return }

        switch (pathname) {
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

export type { FileTreeNode, FileSearchResult } from './host/tree.ts'
export type { GitChange, GitStatusData } from './host/status.ts'

export interface GitCommit {
  hash: string
  parents: string[]
  shortHash: string
  author: string
  email: string
  timestamp: number
  message: string
}