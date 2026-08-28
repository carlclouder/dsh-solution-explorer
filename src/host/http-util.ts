import type { IncomingMessage, ServerResponse } from 'node:http'
import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'

export function json(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

/** Strict containment: the resolved path must be inside the workspace root. */
export function ensureInside(root: string, p: string): boolean {
  const resolvedRoot = pathModule.resolve(root)
  const full = pathModule.resolve(root, p)
  return full !== resolvedRoot && full.startsWith(resolvedRoot + pathModule.sep)
}

/** Pick a non-colliding destination: append " copy" / " copy 2" while taken. */
export async function autoRename(dest: string): Promise<string> {
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
export async function movePath(source: string, dest: string): Promise<void> {
  try {
    await fsp.rename(source, dest)
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
    await fsp.cp(source, dest, { recursive: true })
    await fsp.rm(source, { recursive: true, force: true })
  }
}

/** Parse a query string into a record. */
export function parseQuery(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { out[k] = v })
  return out
}
