import type { ServerResponse } from 'node:http'

import { json } from '../http-util.ts'
import type { TermChunk, TerminalState } from './state.ts'

/**
 * The single multiplexed SSE stream: every terminal session's output flows
 * through one long-lived connection (browsers cap concurrent HTTP/1.1
 * connections per origin, so per-tab streams would starve after ~3 terminals).
 */
export function createTerminalStream(state: TerminalState, deps: { killAllSessions(): void }) {
  const handler = (res: ServerResponse): void => {
    if (state.terminalStreamOn) { json(res, { ok: false, error: { message: 'terminal stream already open' } }, 409); return }
    state.terminalStreamOn = true
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.write(':ok\n\n')
    const onMsg = (m: TermChunk): void => {
      if (!res.writable) return
      if (m.end) res.write(`event: end\ndata: ${m.id}\n\n`)
      else res.write(`event: t\ndata: ${m.id}|${m.data}\n\n`)
    }
    state.termListeners.add(onMsg)
    const cleanup = (): void => {
      state.termListeners.delete(onMsg)
      state.terminalStreamOn = false
      // Disconnect policy: the page that owned the terminals is gone —
      // kill every session so no shell outlives it.
      deps.killAllSessions()
    }
    res.on('close', cleanup)
  }
  return handler
}
