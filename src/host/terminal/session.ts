import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'

import { attachSessionSink, type SubprocessServiceLike, type TerminalSession, type TerminalState } from './state.ts'

/** Dependencies injected at assembly time so session.ts never reaches for cordis ctx. */
export interface SessionDeps {
  getSubprocess(): SubprocessServiceLike | undefined
}

/** The terminal session lifecycle surface exposed to routes/terminal.ts. */
export interface TerminalSessions {
  terminalSupported(): boolean
  spawnTerminalSession(cwd: string, shell: string | undefined, rows: number, cols: number): Promise<TerminalSession>
  killSession(id: string): void
  killAllSessions(): void
  attachSessionSink(session: TerminalSession): () => void
}

/**
 * Terminal session lifecycle: shell resolution, spawn, and kill. The shared
 * `state` (terminals map / seq) is the single source of truth; the output hub
 * (termPush / attachSessionSink) lives in state.ts and is reused here.
 */
export function createTerminalSessions(state: TerminalState, deps: SessionDeps): TerminalSessions {
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

  const terminalSupported = (): boolean => {
    const sub = deps.getSubprocess()
    return !!sub && typeof sub.spawnTerminal === 'function'
  }

  const spawnTerminalSession = async (cwd: string, shell: string | undefined, rows: number, cols: number): Promise<TerminalSession> => {
    const sub = deps.getSubprocess()
    if (!sub || typeof sub.spawnTerminal !== 'function') throw new Error('subprocess service unavailable')
    const candidates = await resolveShellCandidates(shell)
    let lastError: unknown
    for (const argv of candidates) {
      try {
        const handle = await sub.spawnTerminal({ argv, cwd, rows, cols, graceMs: 2000 })
        const id = 't' + (++state.terminalSeq).toString(36) + Math.random().toString(36).slice(2, 6)
        const session: TerminalSession = { id, cwd, shell: argv.join(' '), handle, streaming: false }
        state.terminals.set(id, session)
        session.bound = attachSessionSink(state, session)
        return session
      } catch (err) { lastError = err }
    }
    throw lastError instanceof Error ? lastError : new Error('terminal spawn failed')
  }

  const killSession = (id: string): void => {
    const session = state.terminals.get(id)
    if (!session) return
    if (session.bound) { session.bound(); session.bound = undefined }
    state.terminals.delete(id)
    void session.handle.terminate().catch(() => { /* session already gone */ })
  }

  const killAllSessions = (): void => {
    for (const s of [...state.terminals.values()]) killSession(s.id)
  }

  return { terminalSupported, spawnTerminalSession, killSession, killAllSessions, attachSessionSink: (session: TerminalSession) => attachSessionSink(state, session) }
}
