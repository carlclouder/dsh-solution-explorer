import { git, isValidRemoteUrl, isValidRefName } from '../git-runner.ts'
import { json } from '../http-util.ts'
import type { Handler } from './context.ts'

export const branchRemotePost: Record<string, Handler> = {
  '/solution-explorer/git-remote-add': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const remoteUrl = typeof payload.url === 'string' ? payload.url : ''
    if (!root || !name || !remoteUrl) { json(res, { ok: false, error: { message: 'root, name and url required' } }); return }
    if (!isValidRefName(name) || !isValidRemoteUrl(remoteUrl)) {
      json(res, { ok: false, error: { message: '远程名称或 URL 格式无效' } }); return
    }
    const result = git(['remote', 'add', name, remoteUrl], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-remote-remove': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'invalid remote name' } }); return }
    const result = git(['remote', 'remove', name], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-remote-set-url': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const remoteUrl = typeof payload.url === 'string' ? payload.url : ''
    if (!root || !name || !remoteUrl) { json(res, { ok: false, error: { message: 'root, name and url required' } }); return }
    if (!isValidRefName(name) || !isValidRemoteUrl(remoteUrl)) {
      json(res, { ok: false, error: { message: '远程名称或 URL 格式无效' } }); return
    }
    const result = git(['remote', 'set-url', name, remoteUrl], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-create': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const from = typeof payload.from === 'string' && payload.from ? payload.from : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
    const args = ['branch', name]
    if (from) { if (!isValidRefName(from)) { json(res, { ok: false, error: { message: 'invalid from ref' } }); return } args.push(from) }
    const result = git(args, root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-checkout': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const track = payload.track === true
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '引用名称无效' } }); return }
    // Refuse to switch while the working tree is dirty — git would risk
    // overwriting uncommitted changes with a cryptic error.
    const dirty = git(['status', '--porcelain'], root)
    if (dirty.ok && dirty.stdout.trimEnd() !== '') {
      json(res, { ok: false, error: { message: '工作区有未提交的更改，请先提交或放弃后再切换分支' } }); return
    }
    // Remote branch click (track=true): create a local tracking branch
    // instead of detaching HEAD — VS Code style checkout.
    if (!track) {
      const result = git(['checkout', name], root)
      json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
      return
    }
    // Remote-branch checkout: resolve origin/HEAD to its target, then
    // reuse an existing local branch instead of failing with --track.
    let target = name
    if (target.endsWith('/HEAD')) {
      const sym = git(['symbolic-ref', '--short', 'refs/remotes/' + target], root)
      if (!sym.ok) { json(res, { ok: false, error: { message: '无法解析 ' + target } }); return }
      target = sym.stdout.trimEnd()
    }
    const short = target.includes('/') ? target.slice(target.indexOf('/') + 1) : target
    if (short === 'HEAD' || !isValidRefName(short)) {
      json(res, { ok: false, error: { message: '分支名称无效' } }); return
    }
    const localExists = git(['rev-parse', '--verify', '--quiet', 'refs/heads/' + short], root).ok
    const args = localExists ? ['checkout', short] : ['checkout', '--track', target]
    const result = git(args, root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-delete': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const force = payload.force === true
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
    const result = git(['branch', force ? '-D' : '-d', name], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-rename': async ({ res, payload, root }) => {
    const oldName = typeof payload.oldName === 'string' ? payload.oldName : ''
    const newName = typeof payload.newName === 'string' ? payload.newName : ''
    if (!root || !oldName || !newName) { json(res, { ok: false, error: { message: 'root, oldName and newName required' } }); return }
    if (!isValidRefName(oldName) || !isValidRefName(newName)) {
      json(res, { ok: false, error: { message: '分支名称无效' } }); return
    }
    const result = git(['branch', '-m', oldName, newName], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-merge': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
    const result = git(['merge', name], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-publish': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: '分支名称无效' } }); return }
    const result = git(['push', '-u', 'origin', name], root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
}
