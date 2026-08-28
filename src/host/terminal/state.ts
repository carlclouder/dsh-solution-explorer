import type { Readable } from 'node:stream'

/**
 * Structural views of the dsh-subprocess terminal contract. The service is
 * obtained at runtime through ctx.get('subprocess'); these local shapes keep
 * the host half free of a hard dependency on @deepseek-ai/dsh-subprocess.
 */
export interface PtyHandleLike {
  readonly pid: number
  readonly output: Readable
  readonly done: Promise<unknown>
  write(data: string): Promise<void>
  terminate(): Promise<void>
}

export interface SubprocessServiceLike {
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

export interface TerminalSession {
  id: string
  cwd: string
  shell: string
  handle: PtyHandleLike
  streaming: boolean
  /** Detaches this session's output sink from the shared stream hub. */
  bound?: (() => void) | null
}

/** One multiplexed terminal output frame pushed through the shared SSE stream. */
export interface TermChunk {
  id: string
  data?: string
  end?: boolean
}

/**
 * The terminal subsystem's shared mutable state — the single source of truth
 * read/written by session.ts (spawn/kill), sse.ts (stream hub + disconnect
 * kill-all) and routes/terminal.ts (input/reboot/delete lookups).
 */
export interface TerminalState {
  terminals: Map<string, TerminalSession>
  termListeners: Set<(m: TermChunk) => void>
  terminalStreamOn: boolean
  terminalSeq: number
}

export function createTerminalState(): TerminalState {
  return {
    terminals: new Map(),
    termListeners: new Set(),
    terminalStreamOn: false,
    terminalSeq: 0,
  }
}

/** Push a multiplexed output frame to every connected SSE listener. */
export function termPush(state: TerminalState, m: TermChunk): void {
  for (const fn of state.termListeners) {
    try { fn(m) } catch { /* listener failure must not break the hub */ }
  }
}

/**
 * Bind a session's output stream to the shared SSE hub; returns a disposer that
 * detaches the listeners. The output hub is held here (not in session.ts)
 * because it only touches `state.termListeners` — spawn and reboot both reuse
 * this sink without creating a session↔sse import cycle.
 */
export function attachSessionSink(state: TerminalState, session: TerminalSession): () => void {
  const output = session.handle.output
  const onData = (chunk: Buffer | string): void => {
    const data = Buffer.isBuffer(chunk) ? chunk.toString('base64') : Buffer.from(String(chunk)).toString('base64')
    termPush(state, { id: session.id, data })
  }
  const onEnd = (): void => { termPush(state, { id: session.id, end: true }) }
  output.on('data', onData)
  output.on('end', onEnd)
  return () => {
    output.off('data', onData)
    output.off('end', onEnd)
  }
}
