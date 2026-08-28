import * as pathModule from 'node:path'

/** True when `target` resolves inside `root` (or equals it). */
export function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = pathModule.resolve(root)
  const fullPath = pathModule.resolve(target)
  return fullPath === resolvedRoot || fullPath.startsWith(resolvedRoot + pathModule.sep)
}

/** Normalize a path to forward slashes for git-status matching. */
export function normPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Decode a git C-style quoted pathname (porcelain v1 always quotes paths that
 * contain spaces or other special characters, regardless of core.quotePath).
 * Non-quoted input is returned unchanged.
 */
export function unquoteGitPath(s: string): string {
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

/** True when a file name matches any configured filter pattern (glob-ish). */
export function matchesFilter(name: string, patterns: string[] | undefined): boolean {
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
