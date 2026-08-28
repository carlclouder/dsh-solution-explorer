import type { ServerResponse } from 'node:http'
import type { Config } from '../config.ts'

/**
 * Shared per-request context passed to every route handler. It carries the
 * parsed request facts plus the two apply-closure dependencies the non-terminal
 * routes need: the effective config (read/write) and settings persistence.
 * Terminal routes still live in index.ts until the M1.3 extraction.
 */
export interface RouteContext {
  res: ServerResponse
  pathname: string
  query: Record<string, string>
  payload: Record<string, unknown>
  root: string
  files: string[]
  getConfig(): Config
  setConfig(next: Config): void
  persist(next: Config): Promise<void>
}

export type Handler = (ctx: RouteContext) => Promise<void>
