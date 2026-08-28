import type { ServerResponse } from 'node:http'

import { json } from '../http-util.ts'
import { isPathInside } from '../paths.ts'
import type { Config } from '../config.ts'
import type { TerminalState, TerminalSession } from '../terminal/state.ts'
import type { TerminalSessions } from '../terminal/session.ts'

/** Terminal route handlers, wired into the method-first shell in index.ts (not
 *  the exact-path tables). Each handler receives the already-resolved facts it
 *  needs — the session id is matched by the caller's regex, never re-parsed here. */
export interface TerminalRoutes {
  /** GET /solution-explorer/terminal/stream — the shared SSE output hub. */
  stream(res: ServerResponse): void
  /** POST /solution-explorer/terminal — open a new session. */
  open(res: ServerResponse, payload: Record<string, unknown>, root: string, getConfig: () => Config): Promise<void>
  /** POST /solution-explorer/terminal/:id/input — write to a session. */
  input(res: ServerResponse, id: string, payload: Record<string, unknown>): Promise<void>
  /** POST /solution-explorer/terminal/:id/reboot — respawn under the same id. */
  reboot(res: ServerResponse, id: string, payload: Record<string, unknown>): Promise<void>
  /** DELETE /solution-explorer/terminal/:id — kill a session. */
  remove(res: ServerResponse, id: string): void
}

export function createTerminalRoutes(state: TerminalState, sessions: TerminalSessions, stream: (res: ServerResponse) => void): TerminalRoutes {
  return {
    stream,
    open: async (res, payload, root, getConfig) => {
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : ''
      if (!root || !cwd) { json(res, { ok: false, error: { message: 'root and cwd required' } }); return }
      if (!isPathInside(root, cwd)) { json(res, { ok: false, error: { message: 'cwd outside workspace' } }); return }
      if (!sessions.terminalSupported()) { json(res, { ok: false, code: 'unsupported', error: { message: 'subprocess service unavailable' } }); return }
      const rows = Math.min(120, Math.max(5, typeof payload.rows === 'number' ? Math.floor(payload.rows) : 24))
      const cols = Math.min(400, Math.max(20, typeof payload.cols === 'number' ? Math.floor(payload.cols) : 80))
      try {
        const session = await sessions.spawnTerminalSession(cwd, typeof payload.shell === 'string' ? payload.shell : getConfig().terminalShell, rows, cols)
        json(res, { ok: true, value: { id: session.id, shell: session.shell } })
      } catch (err) {
        json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
      }
    },
    input: async (res, id, payload) => {
      const session = state.terminals.get(id)
      if (!session) { json(res, { ok: false, error: { message: 'terminal not found' } }, 404); return }
      const data = typeof payload.data === 'string' ? payload.data : ''
      await session.handle.write(data)
      json(res, { ok: true, value: true })
    },
    reboot: async (res, id, payload) => {
      const session = state.terminals.get(id)
      if (!session) { json(res, { ok: false, error: { message: 'terminal not found' } }, 404); return }
      const rows = Math.min(120, Math.max(5, typeof payload.rows === 'number' ? Math.floor(payload.rows) : 24))
      const cols = Math.min(400, Math.max(20, typeof payload.cols === 'number' ? Math.floor(payload.cols) : 80))
      try {
        if (session.bound) { session.bound(); session.bound = undefined }
        await session.handle.terminate()
        const next = await sessions.spawnTerminalSession(session.cwd, session.shell, rows, cols)
        // Re-key to the original tab id and rebind the output sink to it
        // (the fresh spawn attached its sink under its temporary id).
        state.terminals.delete(next.id)
        next.id = session.id
        if (next.bound) next.bound()
        next.bound = sessions.attachSessionSink(next)
        next.streaming = false
        state.terminals.set(session.id, next)
        json(res, { ok: true, value: true })
      } catch (err) {
        json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
      }
    },
    remove: (res, id) => {
      const session = state.terminals.get(id)
      if (!session) { json(res, { ok: false, error: { message: 'terminal not found' } }, 404); return }
      sessions.killSession(id)
      json(res, { ok: true, value: true })
    },
  }
}

export type { TerminalSession }
