import { git } from '../git-runner.ts'
import { json } from '../http-util.ts'
import type { Handler } from './context.ts'

export const gitSyncPost: Record<string, Handler> = {
  '/solution-explorer/git-fetch': async ({ res, root }) => {
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    const result = git(['fetch'], root)
    json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-pull': async ({ res, root }) => {
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    const headRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
    if (headRef.ok && headRef.stdout === 'HEAD') {
      json(res, { ok: false, error: { message: '当前不在任何分支上（detached HEAD），请先在分支面板切换到分支再拉取' } }); return
    }
    const result = git(['pull'], root)
    json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-push': async ({ res, root }) => {
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    const headRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
    if (headRef.ok && headRef.stdout === 'HEAD') {
      json(res, { ok: false, error: { message: '当前不在任何分支上（detached HEAD），请先在分支面板切换到分支再推送' } }); return
    }
    const result = git(['push'], root)
    json(res, result.ok ? { ok: true, value: result.stdout } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-sync': async ({ res, root }) => {
    if (!root) { json(res, { ok: false, error: { message: 'root required' } }); return }
    const headRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
    if (headRef.ok && headRef.stdout === 'HEAD') {
      json(res, { ok: false, error: { message: '当前不在任何分支上（detached HEAD），请先在分支面板切换到分支再同步' } }); return
    }
    // VS Code "Sync Changes": pull first, then push; a failed pull stops.
    const pull = git(['pull'], root)
    if (!pull.ok) { json(res, { ok: false, error: { message: pull.error } }); return }
    const push = git(['push'], root)
    json(res, push.ok ? { ok: true, value: push.stdout } : { ok: false, error: { message: push.error } })
  },
}
