import { execFileSync } from 'node:child_process'

/**
 * Run a git command in the given repo root.
 *
 * Uses execFileSync (args passed as an array, no shell quoting) so the command
 * line survives Windows cmd.exe tokenization — a string-built form like
 * `git ["status","--porcelain","-u"]` is collapsed into a single bogus
 * argument and fails with "not a git command".
 */
export function git(args: string[], root: string): { ok: true; stdout: string } | { ok: false; error: string } {
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

export function isGitRepo(root: string): boolean {
  return git(['rev-parse', '--git-dir'], root).ok
}

/** Remote URL shape: http(s)://, ssh://, or scp-like git@host:path. */
export function isValidRemoteUrl(url: string): boolean {
  return /^(https?:\/\/|ssh:\/\/|git@[\w.-]+:)/.test(url)
}

/** Branch/tag name: no whitespace, control chars or `-` prefix (git ref rules). */
export function isValidRefName(name: string): boolean {
  return name.length > 0 && !/[\s~^:?*[\\]/.test(name) && !name.startsWith('-')
}
