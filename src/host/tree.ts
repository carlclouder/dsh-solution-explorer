import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'
import { matchesFilter } from './paths.ts'

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

/** Image extensions the editor can preview (served raw via /raw). */
export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

export function imageMime(ext: string): string {
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'svg': return 'image/svg+xml'
    case 'ico': return 'image/x-icon'
    default: return 'image/' + ext
  }
}

export async function buildFileTree(root: string, relativePath: string, filterPatterns: string[] = [], showHidden = false): Promise<FileTreeNode> {
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

export async function searchFiles(root: string, query: string, maxResults = 50): Promise<FileSearchResult[]> {
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
