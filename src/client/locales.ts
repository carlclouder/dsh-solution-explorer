/**
 * Locale dictionaries for the solution explorer plugin.
 * @module dsh-solution-explorer/client/locales
 */

export const NS = 'solution-explorer'

export type SolutionExplorerKey = keyof typeof zh

const zh = {
  // Panel tabs
  'panel.explorer': '文件浏览器',
  'panel.scm': '源代码管理',
  'panel.scm.title': '源代码管理',
  'panel.title': '文件浏览器',
  'panel.empty': '打开工作区后显示文件',
  'toggle.panel': '切换面板',
  'panel.editor': '编辑',
  'panel.editor.title': '编辑器',

  // File explorer
  'file.search': '搜索文件...',
  'file.open': '打开文件',
  'file.openInExplorer': '在文件管理器中打开',
  'editor.save': '保存',
  'editor.saving': '保存中...',
  'editor.saved': '已保存',
  'editor.saveFailed': '保存失败',
  'editor.dirty': '未保存的更改',
  'editor.saveHint': 'Ctrl+S 保存',
  'editor.restartHint': '（插件后端未加载保存路由，请完全退出并重启 DSH 应用后再保存）',
  'editor.untitled': '无标题',
  'editor.noFile': '选择一个文件查看或编辑',
  'diff.noFile': '双击源代码管理里的变更项查看差异',
  'editor.readonly': '（只读）',
  'editor.close': '关闭',
  'editor.unsaved': '未保存',
  'tree.collapse': '收起全部',
  'tree.expand': '展开全部',
  'loading': '加载中...',
  'error.load': '加载文件树失败',
  'error.read': '读取文件失败',
  'context.copyPath': '复制路径',
  'context.reveal': '在文件管理器中显示',

  // SCM
  'scm.staged': '暂存变更',
  'scm.staged.none': '没有暂存变更',
  'scm.changes': '更改',
  'scm.changes.none': '没有更改',
  'scm.untracked': '未跟踪',
  'scm.commit.placeholder': '提交变更内容',
  'scm.commit.button': '提交',
  'scm.commit.empty': '请输入提交信息',
  'scm.stage': '暂存',
  'scm.unstage': '取消暂存',
  'scm.discard': '放弃变更',
  'scm.stageAll': '全部暂存',
  'scm.unstageAll': '全部取消暂存',
  'scm.discardAll': '放弃所有变更',
  'scm.discardAllConfirm': '确定放弃所有变更？此操作不可撤销。',
  'scm.refresh': '刷新',
  'scm.branch': '分支',
  'scm.notRepo': '不是 Git 仓库',
  'scm.committing': '提交中...',
  'scm.commitSuccess': '提交成功',
  'scm.commitFailed': '提交失败',
  'scm.diff.title': '差异',
  'scm.log.title': '提交历史',
  'scm.log.empty': '没有提交记录',
  'scm.status.M': '修改',
  'scm.status.A': '新增',
  'scm.status.D': '删除',
  'scm.status.R': '重命名',
  'scm.status.?': '未跟踪',
  'scm.status.U': '未合并',
  'scm.repository': '存储库',
  'scm.repository.branch': '分支',
  'scm.repository.commits': '最近提交',
}

const en: Record<SolutionExplorerKey, string> = {
  'panel.explorer': 'Explorer',
  'panel.scm': 'Source Control',
  'panel.scm.title': 'Source Control',
  'panel.title': 'File Explorer',
  'panel.empty': 'Open a workspace to browse files',
  'toggle.panel': 'Toggle panel',
  'panel.editor': 'Edit',
  'panel.editor.title': 'Editor',

  'file.search': 'Search files...',
  'file.open': 'Open file',
  'file.openInExplorer': 'Open in file explorer',
  'editor.save': 'Save',
  'editor.saving': 'Saving...',
  'editor.saved': 'Saved',
  'editor.saveFailed': 'Save failed',
  'editor.dirty': 'Unsaved changes',
  'editor.saveHint': 'Ctrl+S to save',
  'editor.restartHint': ' (plugin backend save route not loaded — please fully quit and restart the DSH app before saving)',
  'editor.untitled': 'Untitled',
  'editor.noFile': 'Select a file to view or edit',
  'diff.noFile': 'Double-click a change in Source Control to view its diff',
  'editor.readonly': '(read-only)',
  'editor.close': 'Close',
  'editor.unsaved': 'Unsaved',
  'tree.collapse': 'Collapse all',
  'tree.expand': 'Expand all',
  'loading': 'Loading...',
  'error.load': 'Failed to load file tree',
  'error.read': 'Failed to read file',
  'context.copyPath': 'Copy path',
  'context.reveal': 'Reveal in file explorer',

  'scm.staged': 'Staged Changes',
  'scm.staged.none': 'No staged changes',
  'scm.changes': 'Changes',
  'scm.changes.none': 'No changes',
  'scm.untracked': 'Untracked',
  'scm.commit.placeholder': 'Commit changes',
  'scm.commit.button': 'Commit',
  'scm.commit.empty': 'Please enter a commit message',
  'scm.stage': 'Stage',
  'scm.unstage': 'Unstage',
  'scm.discard': 'Discard',
  'scm.stageAll': 'Stage All',
  'scm.unstageAll': 'Unstage All',
  'scm.discardAll': 'Discard All',
  'scm.discardAllConfirm': 'Discard all changes? This cannot be undone.',
  'scm.refresh': 'Refresh',
  'scm.branch': 'Branch',
  'scm.notRepo': 'Not a git repository',
  'scm.committing': 'Committing...',
  'scm.commitSuccess': 'Commit successful',
  'scm.commitFailed': 'Commit failed',
  'scm.diff.title': 'Diff',
  'scm.log.title': 'History',
  'scm.log.empty': 'No commits',
  'scm.status.M': 'Modified',
  'scm.status.A': 'Added',
  'scm.status.D': 'Deleted',
  'scm.status.R': 'Renamed',
  'scm.status.?': 'Untracked',
  'scm.status.U': 'Unmerged',
  'scm.repository': 'Repository',
  'scm.repository.branch': 'Branch',
  'scm.repository.commits': 'Recent Commits',
}

export const dictionaries = { zh, en }

let currentLang: 'zh' | 'en' = 'zh'

export function setLanguage(lang: 'zh' | 'en'): void {
  currentLang = lang
}

export function t(key: SolutionExplorerKey): string {
  const dict = currentLang === 'zh' ? zh : en
  return dict[key] ?? key
}
