/**

 * dsh-solution-explorer — browser half: registers a dual-panel (Explorer + SCM)

 * component into the "details" slot of the web shell's three-column layout.

 * @module dsh-solution-explorer/client

 */



import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'

import type {} from '@deepseek-ai/dsh-client-ui-slots'

import type {} from '@deepseek-ai/dsh-client-locale/client'

import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'

import { NS, dictionaries, setLanguage, t, type SolutionExplorerKey } from './locales.ts'

import { langFromPath, highlightToHtml, highlightLinesHtml } from './highlight.ts'



declare module '@deepseek-ai/dsh-client-ui-slots' {

  interface LocaleNamespaceMap {

    'solution-explorer': SolutionExplorerKey

  }

  interface SlotMap {}

}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {

  interface ViewTab {

    id: string

  }

}



declare global {

  interface Window {

    __solExpTab?: (tab: string) => void

    __solExpToggleExpand?: (path: string) => void

    __solExpSelectFile?: (path: string) => Promise<void>

    __solExpCollapseAll?: () => void

    __solExpExpandAll?: () => void

    __solExpRefresh?: () => void

    __solExpSearch?: (query: string) => void

    __solExpRefreshSCM?: () => void
    __solExpCommitsScroll?: (evt: Event) => void
    __solExpScmDividerDown?: (evt: PointerEvent) => void
    __solExpSelectRepo?: (path: string) => void
    __solExpCommitDetail?: (hash: string) => Promise<void>
    __solExpCommitCheckout?: (hash: string) => Promise<void>
    __solExpGitInit?: () => Promise<void>
    __solExpFetch?: () => Promise<void>
    __solExpPull?: () => Promise<void>
    __solExpPush?: () => Promise<void>
    __solExpSync?: () => Promise<void>
    __solExpRemotePanel?: () => Promise<void>
    __solExpRemoteName?: (v: string) => void
    __solExpRemoteUrl?: (v: string) => void
    __solExpRemoteAdd?: () => Promise<void>
    __solExpRemoteRemove?: (name: string) => Promise<void>
    __solExpRemoteSetUrl?: (name: string) => Promise<void>
    __solExpBranchPanel?: () => Promise<void>
    __solExpBranchName?: (v: string) => void
    __solExpBranchFrom?: (v: string) => void
    __solExpBranchCreate?: () => Promise<void>
    __solExpBranchCheckout?: (name: string, isRemote?: boolean) => Promise<void>
    __solExpBranchDelete?: (name: string) => Promise<void>
    __solExpBranchRename?: (name: string) => Promise<void>
    __solExpBranchMerge?: (name: string) => Promise<void>
    __solExpBranchPublish?: (name: string) => Promise<void>

    __solExpCommitMsg?: (msg: string) => void

    __solExpCommit?: () => void

    __solExpStage?: (files: string[]) => void

    __solExpUnstage?: (files: string[]) => void

    __solExpDiscard?: (files: string[]) => void

    __solExpStageAll?: () => void

    __solExpUnstageAll?: () => void

    __solExpDiscardAll?: () => void

    __solExpToggleSection?: (id: string) => void

    __solExpOpenFile?: (path: string) => Promise<void>

    __solExpSaveFile?: () => Promise<void>

    __solExpGetEditorState?: () => { editorFile: string | null; editorContent: string | null; editorLoading: boolean; editorError: string | null; editorSaving: boolean; editorUnsupported: boolean }

    __solExpEditorListeners?: Set<() => void>

    __solExpOpenDiff?: (path: string, staged: boolean) => Promise<void>

    __solExpGetDiffState?: () => { diffPath: string | null; diffStaged: boolean; diffContent: string | null; diffOldContent: string; diffNewContent: string; diffLoading: boolean; diffRoot: string }

    __solExpDiffListeners?: Set<() => void>

    __solExpSelect?: (path: string, shift: boolean, ctrl: boolean, isDir: boolean) => void

    __solExpClearSelection?: () => void

    __solExpCopy?: () => void

    __solExpCut?: () => void

    __solExpPaste?: (target: string) => Promise<void>

    __solExpNew?: (type: 'file' | 'dir', dir: string) => Promise<void>

    __solExpDragStart?: (path: string) => void

    __solExpDragOver?: (path: string, evt: DragEvent) => void

    __solExpDrop?: (path: string, evt: DragEvent) => Promise<void>

    __solExpDropFiles?: (target: string, files: FileList | File[]) => Promise<void>

    __solExpDeletePaths?: (paths: string[]) => Promise<void>

    __solExpPanelContextMenu?: (evt: MouseEvent) => void

    __solExpContextMenu?: (target: string, x: number, y: number, isDir?: boolean) => void

    __solExpDeleteFile?: (target: string) => Promise<void>

    __solExpClearSearch?: () => void

  }

}

		const STYLES = `

.sol-exp-panel { height:100%; display:flex; flex-direction:column; background:var(--dsw-specific-sidebar-fill); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; user-select:none; overflow:hidden; }

.sol-exp-header { flex:none; display:flex; align-items:center; justify-content:space-between; gap:4px; height:34px; padding:0 8px 0 6px; box-sizing:border-box; border-radius:12px; color:var(--dsw-alias-label-tertiary); }

.sol-exp-title { font-size:13px; font-weight:500; color:var(--dsw-alias-label-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }

.sol-exp-header-actions { display:flex; gap:2px; }

.sol-exp-toolbar-btn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border:none; background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; border-radius:6px; padding:0; }

.sol-exp-toolbar-btn:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }

.sol-exp-search { display:flex; align-items:center; gap:4px; padding:0 8px 6px; flex-shrink:0; }

.sol-exp-search-icon { flex:none; color:var(--dsw-alias-label-tertiary); }

.sol-exp-search-input { flex:1; width:0; min-width:0; box-sizing:border-box; padding:2px 8px; border:none; border-radius:6px; background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; outline:none; }

.sol-exp-search-input:focus { background:var(--dsw-alias-interactive-bg-hover-solid,var(--dsw-alias-interactive-bg-hover)); }

.sol-exp-content { flex:1; overflow-y:auto; overflow-x:hidden; }

.sol-exp-loading, .sol-exp-empty, .sol-exp-error { padding:16px; text-align:center; color:var(--dsw-alias-label-tertiary,#6e6e6e); font-size:13px; }

.sol-exp-error { color:var(--dsw-color-error,#f48771); }

.sol-exp-tree { padding:2px 0; }

.sol-exp-tree-node { display:flex; align-items:center; gap:2px; padding:2px 8px 2px 4px; cursor:pointer; white-space:nowrap; height:24px; line-height:24px; color:var(--dsw-alias-label-primary); }

.sol-exp-tree-node:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }

.sol-exp-tree-node.sol-exp-selected { background:var(--dsw-alias-interactive-bg-active,rgba(0,120,212,0.2)); }

.sol-exp-cut { opacity:.5; }

.sol-exp-drop-target { outline:1px solid var(--dsw-alias-state-business-primary,#0078d4); outline-offset:-1px; background:var(--dsw-alias-interactive-bg-active,rgba(0,120,212,0.2)); }

.sol-exp-chevron { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; color:var(--dsw-alias-label-tertiary,#6e6e6e); }

.sol-exp-file-icon { margin-right:4px; flex-shrink:0; display:inline-flex; align-items:center; line-height:1; }

.sol-exp-file-name { overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }

.sol-exp-git-M { color:#e2b714; } .sol-exp-git-A { color:#4ec9b0; } .sol-exp-git-D { color:#f14c4c; }

.sol-exp-git-R { color:#4ec9b0; } .sol-exp-git-q { color:#4ec9b0; } .sol-exp-git-x { color:#6e6e6e; } .sol-exp-git-\? { color:#4ec9b0; }

.sol-exp-scm-section { }

.sol-exp-scm-section-header { display:flex; align-items:center; gap:4px; padding:8px 12px; cursor:pointer; font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary,#969696); }

.sol-exp-scm-section-header:hover { color:var(--dsw-alias-label-primary,#d4d4d4); }

.sol-exp-scm-section-count { font-size:11px; font-weight:400; color:var(--dsw-alias-label-tertiary,#6e6e6e); }

.sol-exp-scm-item { display:flex; align-items:center; gap:6px; padding:3px 12px 3px 24px; cursor:pointer; font-size:13px; line-height:22px; }

.sol-exp-scm-item:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }

.sol-exp-scm-status { font-size:11px; font-weight:700; width:16px; text-align:center; flex-shrink:0; }

.sol-exp-scm-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }

.sol-exp-scm-actions { display:none; gap:2px; flex-shrink:0; }

.sol-exp-scm-item:hover .sol-exp-scm-actions { display:flex; }

.sol-exp-scm-action-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; background:transparent; color:var(--dsw-alias-label-tertiary,#6e6e6e); cursor:pointer; border-radius:3px; padding:0; font-size:11px; }

.sol-exp-scm-action-btn:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.1)); color:var(--dsw-alias-label-primary,#d4d4d4); }

.sol-exp-diff { margin:0 12px 6px 40px; border-left:2px solid var(--dsw-alias-border-l2,#333); background:var(--dsw-alias-bg-input,rgba(0,0,0,0.2)); border-radius:6px; overflow:hidden; }

.sol-exp-diff-line { padding:0 8px; font-family:'Cascadia Code','Fira Code','Consolas',monospace; font-size:12px; line-height:18px; white-space:pre; color:var(--dsw-alias-label-secondary,#969696); }

.sol-exp-diff-line.add { background:rgba(78,201,176,0.12); color:#4ec9b0; }

.sol-exp-diff-line.del { background:rgba(241,76,76,0.12); color:#f14c4c; }

.sol-exp-diff-line.hunk { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); color:var(--dsw-alias-label-primary,#d4d4d4); }

.sol-exp-diff-line.meta { color:var(--dsw-alias-label-tertiary,#6e6e6e); }

.sol-exp-diff-empty { padding:8px; color:var(--dsw-alias-label-tertiary,#6e6e6e); font-size:12px; }

.sol-exp-scm-header-actions { display:flex; align-items:center; gap:2px; margin-left:auto; }

.sol-exp-hdr-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; border-radius:6px; background:transparent; color:var(--dsw-alias-label-tertiary,#6e6e6e); cursor:pointer; padding:0; }

.sol-exp-hdr-btn:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.1)); color:var(--dsw-alias-label-primary,#d4d4d4); }

.sol-exp-hdr-btn.danger { color:var(--dsw-alias-state-error-primary,#f14c4c); }

.sol-exp-hdr-btn.danger:hover { background:var(--dsw-alias-state-error-primary,#f14c4c); color:#fff; }

.sol-exp-commit-box { padding:8px 12px; border-bottom:1px solid var(--dsw-alias-border-l1,#333); }

.sol-exp-commit-input { width:100%; box-sizing:border-box; padding:6px 10px; border:none; border-radius:8px; background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); color:var(--dsw-alias-label-primary,#d4d4d4); font-size:13px; line-height:18px; outline:none; resize:none; font-family:inherit; min-height:60px; transition:background-color 120ms ease; }

.sol-exp-commit-input:focus { background:var(--dsw-alias-interactive-bg-hover-solid,var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.08))); }

.sol-exp-commit-input::placeholder { color:var(--dsw-alias-label-tertiary,#6e6e6e); }

.sol-exp-commit-row { display:block; margin-top:6px; }

.sol-exp-commit-btn { width:100%; padding:5px 0; border:none; border-radius:6px; background:var(--dsw-alias-button-info-fill,#3964fe); color:#fff; font-size:13px; font-weight:500; cursor:pointer; line-height:20px; transition:background-color 120ms ease; }

.sol-exp-commit-btn:hover:not(:disabled) { background:var(--dsw-alias-button-info-hover,#679efe); }

.sol-exp-commit-btn:disabled { opacity:.4; cursor:default; }

.sol-exp-commit-branch { font-size:11px; color:var(--dsw-alias-label-tertiary,#6e6e6e); }

.sol-exp-search-results { padding:4px 0; }

.sol-exp-search-item { display:flex; align-items:center; gap:4px; padding:4px 12px; cursor:pointer; font-size:13px; line-height:20px; }

.sol-exp-search-item:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }

.sol-exp-search-item.sol-exp-selected { background:var(--dsw-alias-interactive-bg-active,rgba(0,120,212,0.2)); }

.sol-exp-icon { flex-shrink:0; font-size:14px; }

.sol-exp-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; max-width:40%; }

.sol-exp-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-tertiary,#6e6e6e); font-size:11px; flex:1; min-width:0; margin-left:4px; }

.sol-exp-path::before { content:'\\2014 '; }

.sol-exp-content::-webkit-scrollbar { width:6px; }

.sol-exp-content::-webkit-scrollbar-track { background:transparent; }

.sol-exp-content::-webkit-scrollbar-thumb { background:var(--dsw-alias-scrollbar-bg-l2,rgba(255,255,255,0.1)); border-radius:3px; }

.sol-exp-body { flex:1; min-height:0; display:flex; }

.sol-exp-activity { flex:none; display:flex; flex-direction:row; align-items:stretch; padding:0 4px; gap:2px; border-bottom:1px solid var(--dsw-alias-border-l1); background:var(--dsw-specific-sidebar-fill); height:36px; }

.sol-exp-activity-btn { position:relative; flex:none; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; border-radius:6px; padding:0; margin:auto 0; }

.sol-exp-activity-btn:hover { color:var(--dsw-alias-label-primary,#d4d4d4); background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }

.sol-exp-activity-btn.active { color:var(--dsw-alias-label-primary,#d4d4d4); background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }

.sol-exp-resize-handle { position:absolute; top:0; bottom:0; width:8px; margin-left:-4px; cursor:col-resize; z-index:2; touch-action:none; background:transparent; }
.sol-exp-resize-handle::after { content:''; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:3px; height:44px; border-radius:2px; background:var(--dsw-alias-button-floating-fill,#0078d4); opacity:0; transition:opacity .12s ease; }
.sol-exp-resize-handle:hover::after, .sol-exp-resize-handle[data-dragging='true']::after { opacity:1; }
.sol-exp-resize-handle[data-overlapped='true'] { pointer-events:none; }

.sol-exp-main { flex:1; min-width:0; display:flex; flex-direction:column; }

.sol-exp-git-letter { flex:none; font-size:11px; font-weight:700; width:16px; text-align:center; margin-left:6px; }

.sol-exp-context-menu { position:absolute; z-index:1000; min-width:140px; padding:4px; background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-3,#1e1e1e)); border:1px solid var(--dsw-alias-border-l2); border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.3); font-size:13px; color:var(--dsw-alias-label-primary); }

.sol-exp-context-menu-item { padding:6px 12px; cursor:pointer; border-radius:6px; display:flex; align-items:center; gap:8px; color:var(--dsw-alias-label-primary); }

.sol-exp-context-menu-item:hover { background:var(--dsw-alias-interactive-bg-hover); }

.sol-exp-context-menu-item.danger { color:var(--dsw-color-error,#f14c4c); }

.sol-exp-context-menu-item.danger:hover { background:var(--dsw-alias-interactive-bg-hover); }

.sol-exp-editor { flex:1; display:flex; flex-direction:column; min-height:0; }

.sol-exp-editor-header { display:flex; align-items:center; justify-content:space-between; gap:4px; padding:6px 8px; border-bottom:1px solid var(--dsw-alias-border-l1,#333); flex-shrink:0; }

.sol-exp-editor-path { font-size:12px; color:var(--dsw-alias-label-secondary,#969696); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.sol-exp-editor-actions { display:flex; gap:4px; flex-shrink:0; }

.sol-exp-editor-btn { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border:none; border-radius:4px; background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); cursor:pointer; font-size:12px; line-height:20px; }

.sol-exp-editor-btn:hover { opacity:.85; }

.sol-exp-editor-btn.primary { background:var(--dsw-alias-bg-modifier,#0078d4); color:#fff; }

.sol-exp-editor-btn.primary:disabled { opacity:.4; cursor:not-allowed; }

.sol-exp-editor-textarea { flex:1; min-height:0; width:100%; box-sizing:border-box; padding:8px 12px; border:none; background:var(--dsw-alias-bg-input,#1e1e1e); color:var(--dsw-alias-label-primary); font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas','Courier New',monospace; font-size:13px; line-height:1.5; outline:none; resize:none; tab-size:2; }

.sol-exp-editor-textarea:focus { background:var(--dsw-alias-bg-input,#252526); }

.sol-exp-editor-status { display:flex; align-items:center; gap:6px; padding:2px 8px; border-top:1px solid var(--dsw-alias-border-l1,#333); font-size:11px; color:var(--dsw-alias-label-tertiary,#6e6e6e); flex-shrink:0; }

.sol-exp-editor-saving { color:var(--dsw-alias-label-secondary,#969696); }

.sol-exp-editor-saved { color:#4ec9b0; }

.sol-exp-editor-unsaved { color:#e2b714; }

.sol-exp-hl .hljs { color: #c9d1d9; background: transparent; }
.sol-exp-hl .hljs-doctag, .sol-exp-hl .hljs-keyword, .sol-exp-hl .hljs-template-tag, .sol-exp-hl .hljs-template-variable, .sol-exp-hl .hljs-type, .sol-exp-hl .hljs-variable.language_ { color: #ff7b72; }
.sol-exp-hl .hljs-title, .sol-exp-hl .hljs-title.class_, .sol-exp-hl .hljs-title.class_.inherited__, .sol-exp-hl .hljs-title.function_ { color: #d2a8ff; }
.sol-exp-hl .hljs-attr, .sol-exp-hl .hljs-attribute, .sol-exp-hl .hljs-literal, .sol-exp-hl .hljs-meta, .sol-exp-hl .hljs-number, .sol-exp-hl .hljs-operator, .sol-exp-hl .hljs-variable, .sol-exp-hl .hljs-selector-attr, .sol-exp-hl .hljs-selector-class, .sol-exp-hl .hljs-selector-id { color: #79c0ff; }
.sol-exp-hl .hljs-regexp, .sol-exp-hl .hljs-string, .sol-exp-hl .hljs-meta .hljs-string { color: #a5d6ff; }
.sol-exp-hl .hljs-built_in, .sol-exp-hl .hljs-symbol { color: #ffa657; }
.sol-exp-hl .hljs-comment, .sol-exp-hl .hljs-code, .sol-exp-hl .hljs-formula { color: #8b949e; }
.sol-exp-hl .hljs-name, .sol-exp-hl .hljs-quote, .sol-exp-hl .hljs-selector-tag, .sol-exp-hl .hljs-selector-pseudo { color: #7ee787; }
.sol-exp-hl .hljs-subst { color: #c9d1d9; }
.sol-exp-hl .hljs-section { color: #1f6feb; font-weight: bold; }
.sol-exp-hl .hljs-bullet { color: #f2cc60; }
.sol-exp-hl .hljs-emphasis { color: #c9d1d9; font-style: italic; }
.sol-exp-hl .hljs-strong { color: #c9d1d9; font-weight: bold; }
.sol-exp-hl .hljs-addition { color: #aff5b4; background-color: #033a16; }
.sol-exp-hl .hljs-deletion { color: #ffdcd7; background-color: #67060c; }
.sol-exp-hl .hljs-char.escape_, .sol-exp-hl .hljs-link, .sol-exp-hl .hljs-params, .sol-exp-hl .hljs-property, .sol-exp-hl .hljs-punctuation, .sol-exp-hl .hljs-tag { }
.sol-exp-scm-section.collapsed > *:not(.sol-exp-scm-section-header) { display:none; }
.sol-exp-scm-section.collapsed .sol-exp-scm-section-header svg { transform: rotate(0deg) !important; }
.sol-exp-branch-pill { display:inline-flex; align-items:center; gap:4px; padding:1px 8px; border-radius:999px; background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.08)); font-size:11px; font-weight:500; color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-commit-item { display:flex; align-items:center; gap:6px; padding:3px 4px; border-radius:6px; cursor:pointer; }
.sol-exp-commit-item:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }
.sol-exp-commit-item.selected { background:var(--dsw-alias-interactive-bg-active,rgba(0,120,212,0.2)); }
.sol-exp-graph-svg { flex:none; display:block; }
.sol-exp-commit-hash { font-family:monospace; font-size:11px; color:var(--dsw-alias-label-tertiary,#6e6e6e); flex:none; }
.sol-exp-commit-msg { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-commit-date { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary,#6e6e6e); }
.sol-exp-commit-detail { margin:2px 4px 6px; padding:6px 10px; border:1px solid var(--dsw-alias-border-l2,#333); border-radius:6px; background:var(--dsw-alias-bg-input,rgba(0,0,0,0.2)); font-size:12px; }
.sol-exp-commit-detail-row { display:flex; gap:8px; padding:2px 0; align-items:baseline; }
.sol-exp-commit-detail-label { flex:none; width:52px; color:var(--dsw-alias-label-tertiary,#6e6e6e); }
.sol-exp-commit-detail-val { flex:1; min-width:0; word-break:break-all; color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-commit-detail-file { padding:1px 0 1px 52px; color:var(--dsw-alias-label-secondary,#969696); font-family:monospace; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sol-exp-commit-detail-close { margin-left:auto; background:transparent; border:none; color:var(--dsw-alias-label-tertiary,#6e6e6e); cursor:pointer; font-size:13px; padding:0 2px; }
.sol-exp-commit-detail-close:hover { color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-commit-detail-btn { background:transparent; border:1px solid var(--dsw-alias-border-l2,#333); color:var(--dsw-alias-label-secondary,#969696); border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer; }
.sol-exp-commit-detail-btn:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.1)); color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-scm-status { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:4px; font-size:11px; font-weight:700; background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }
.sol-exp-scm-split { flex:1; min-height:0; height:100%; display:flex; flex-direction:column; }
.sol-exp-scm-top { flex:1 1 55%; min-height:0; overflow-y:auto; }
.sol-exp-scm-divider { flex:none; height:4px; cursor:row-resize; background:var(--dsw-alias-border-l1,#333); }
.sol-exp-scm-divider:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.12)); }
.sol-exp-scm-bottom { flex:1 1 45%; min-height:0; display:flex; flex-direction:column; }
.sol-exp-scm-section[data-section="repository"] { flex:1; min-height:0; display:flex; flex-direction:column; }
.sol-exp-repo-item { display:flex; align-items:center; gap:6px; padding:3px 8px; border-radius:6px; cursor:pointer; font-size:12px; }
.sol-exp-repo-item:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); }
.sol-exp-repo-item.active { background:var(--dsw-alias-interactive-bg-active,rgba(0,120,212,0.2)); }
.sol-exp-repo-icon { flex:none; color:var(--dsw-alias-state-business-primary,#58a6ff); }
.sol-exp-repo-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-repo-branch { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary,#6e6e6e); }
`;

		export const inject = [

			"locale",

			"sessions",

			"slots"

		];

		let _editorFile = null;

		let _editorContent = null;

		let _editorLoading = false;

		let _editorError = null;

		let _editorSaving = false;

		let _editorUnsupported = false;

		const _editorListeners = /* @__PURE__ */ new Set<() => void>();

		let _diffPath = null;

		let _diffStaged = false;

		let _diffRoot = "";

		let _diffContent = null;

		let _diffOldContent = "";

		let _diffNewContent = "";

		let _diffLoading = false;

		const _diffListeners = /* @__PURE__ */ new Set<() => void>();

		function caretOffsetIn(el) {

const sel = window.getSelection();

if (!sel || sel.rangeCount === 0) return 0;

const range = sel.getRangeAt(0);

const pre = document.createRange();

pre.selectNodeContents(el);

pre.setEnd(range.startContainer, range.startOffset);

return pre.toString().length;

}

function setCaretAt(el, offset) {

el.focus();

const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

let remaining = offset;

let node = null;

while (walker.nextNode()) {

const len = walker.currentNode.textContent.length;

if (remaining <= len) { node = walker.currentNode; break; }

remaining -= len;

}

const range = document.createRange();

if (node) { range.setStart(node, remaining); range.collapse(true); }

else { range.selectNodeContents(el); range.collapse(false); }

const sel = window.getSelection();

if (sel) { sel.removeAllRanges(); sel.addRange(range); }

}

function _notifyDiffListeners() {

			for (const fn of _diffListeners) _diffListeners.has(fn) && fn();

		}

		/** Convert a unified diff into old/new row pairs (with line numbers) for a side-by-side view. */

		function parseSideBySide(content) {

			const rows = [];

			let oldLine = 0, newLine = 0;

			for (const line of content.split("\n")) {

				if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) continue;

				if (line.startsWith("@@")) {

					const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

					if (m) {

						oldLine = parseInt(m[1], 10);

						newLine = parseInt(m[2], 10);

					}

					continue;

				}

				if (line.startsWith("+")) {

					rows.push({

						old: "",

						new: line.slice(1),

						oldNum: null,

						newNum: newLine++

					});

					continue;

				}

				if (line.startsWith("-")) {

					rows.push({

						old: line.slice(1),

						new: "",

						oldNum: oldLine++,

						newNum: null

					});

					continue;

				}

				rows.push({

					old: line.slice(1),

					new: line.slice(1),

					oldNum: oldLine++,

					newNum: newLine++

				});

			}

			return rows;

		}

		function _notifyEditorListeners() {

			for (const fn of _editorListeners) _editorListeners.has(fn) && fn();

		}

		function apply(ctx: ClientContext) {

			ctx.effect(() => ctx.locale.register(NS, dictionaries), "dsh-solution-explorer: dictionaries");

			ctx.effect(() => {

				const styleId = "dsh-solution-explorer-styles";

				if (document.getElementById(styleId)) return () => {};

				const style = document.createElement("style");

				style.id = styleId;

				style.textContent = STYLES;

				document.head.appendChild(style);

				return () => {

					style.remove();

				};

			}, "dsh-solution-explorer: styles");

			ctx.effect(() => {

				let root = "";

				let currentTab = "explorer";

				let treeState = null;

				let loading = false;

				let error = null;

				let searchQuery = "";

				let searchResults = [];

				let searching = false;

				let expandedPaths = /* @__PURE__ */ new Set<string>();

				let selectedPath = null;

				let selectedPaths = /* @__PURE__ */ new Set<string>();

				let selectionAnchor = null;

				let clipboard = null;

				let dragPaths = [];

				let dropTargetPath = null;

				let gitStatus = null;
				let repos = [];
				let activeRepo = "";
				const gitRoot = () => activeRepo || root;

				let commitMessage = "";

				let committing = false;
				let commitsPage = 0;
				let commitsAllLoaded = false;
				let commitsLoading = false;
				let graphLanes = [];
				let graphPrevLanes = [];
				let graphDetailOpen = "";
				let remotePanelOpen = false;
				let branchPanelOpen = false;
				let remotesList = [];
				let branchesList = [];
				let remoteName = "";
				let remoteUrl = "";
				let branchName = "";
				let branchFrom = "";
				let branchNewName = "";
				let tagsList = [];

				let gitChangesCount = 0;

				let activeEl = null;

				let loadSeq = 0;

				function render() {

					if (!activeEl) return;

					setLanguage(document.documentElement.lang?.startsWith("zh") ? "zh" : "en");

					activeEl.innerHTML = buildHTML();

				}

				async function loadTree() {

					if (!root) return;

					const seq = ++loadSeq;

					loading = true;

					error = null;

					render();

					try {

						const result = await (await fetch(`/solution-explorer/tree?root=${encodeURIComponent(root)}`)).json();

						if (seq !== loadSeq || root === "") return;

						if (result.ok) treeState = result.value;

						else error = result.error?.message || "Failed to load tree";

					} catch (err) {

						if (seq !== loadSeq) return;

						error = err instanceof Error ? err.message : String(err);

					}

					loading = false;

					render();

				}

				async function loadRepos() {
					if (!root) return;
					try {
						const result = await (await fetch(`/solution-explorer/git-repos?root=${encodeURIComponent(root)}`)).json();
						if (result.ok && Array.isArray(result.value)) {
							repos = result.value;
							if (!activeRepo || !repos.some((r) => r.path === activeRepo)) {
								activeRepo = repos[0]?.path || root;
							}
							render();
						}
					} catch (err) { console.error("Failed to load repos:", err); }
				}
				window.__solExpSelectRepo = (path) => {
					if (!path || path === activeRepo) return;
					activeRepo = path;
					loadGitStatus();
					loadRecentCommits();
				};
async function loadGitStatus() {

					if (!root) return;

					render();

					try {

						const result = await (await fetch(`/solution-explorer/git-status?root=${encodeURIComponent(gitRoot())}`)).json();

						if (result.ok) {

							gitStatus = result.value;

							gitChangesCount = (result.value.staged?.length || 0) + (result.value.unstaged?.length || 0) + (result.value.untracked?.length || 0);

						}

					} catch {}

					render();

					if (gitStatus && gitStatus.branch !== "unknown") loadRecentCommits();

				}

				function relTime(ts) {
  const diff = Date.now() - (ts || 0);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + " 分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " 小时前";
  const d = Math.floor(h / 24);
  if (d < 30) return d + " 天前";
  return new Date(ts).toLocaleDateString();
}
const GRAPH_COLORS = ["#e2b714", "#4ec9b0", "#58a6ff", "#d2a8ff", "#ff7b72", "#79c0ff", "#7ee787", "#ffa657"];
let toastTimer = null;
/** Lightweight bottom-right toast; never a blocking dialog. */
function showToast(msg, isError = false) {
  let el = document.getElementById("sol-exp-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "sol-exp-toast";
    el.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:99999;max-width:340px;max-height:200px;overflow:auto;padding:8px 12px;border-radius:6px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-3,#1e1e1e));border:1px solid var(--dsw-alias-border-l2,#333);font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.35);white-space:pre-wrap;word-break:break-all;transition:opacity .3s;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.color = isError ? "var(--dsw-color-error,#f48771)" : "var(--dsw-alias-label-primary,#d4d4d4)";
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 4000);
}
function resetGraph() {
  graphLanes = [];
  graphPrevLanes = [];
  graphDetailOpen = "";
}
/** One graph row: vertical lanes + node + merge/branch diagonal lines (lane algorithm). */
function renderGraphRow(commit) {
  const laneW = 14, rowH = 20, nodeR = 3;
  let idx = graphLanes.findIndex((l) => l.hash === commit.hash);
  if (idx === -1) { idx = graphLanes.length; graphLanes.push({ hash: commit.hash, color: graphLanes.length % GRAPH_COLORS.length }); }
  const width = Math.max(laneW, graphLanes.length * laneW);
  let svg = `<svg class="sol-exp-graph-svg" width="${width}" height="${rowH}">`;
  graphPrevLanes.forEach((pl, pi) => {
    const ci = graphLanes.findIndex((l) => l.hash === pl.hash);
    if (ci !== -1 && ci !== pi) {
      const x1 = pi * laneW + laneW / 2, x2 = ci * laneW + laneW / 2;
      svg += `<line x1="${x1}" y1="0" x2="${x2}" y2="${rowH}" stroke="${GRAPH_COLORS[pl.color % GRAPH_COLORS.length]}" stroke-width="2" opacity="0.7"/>`;
    }
  });
  graphLanes.forEach((lane, i) => {
    const x = i * laneW + laneW / 2;
    const color = GRAPH_COLORS[lane.color % GRAPH_COLORS.length];
    if (i === idx) {
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${rowH / 2 - nodeR}" stroke="${color}" stroke-width="2"/>`;
      // Unpushed (local-only) commits: hollow node in the theme's primary label
      // color (auto light/dark); pushed commits: solid lane color.
      if (commit.unpushed) svg += `<circle cx="${x}" cy="${rowH / 2}" r="${nodeR + 1}" fill="none" stroke="var(--dsw-alias-label-primary,#d4d4d4)" stroke-width="2.5"/>`;
      else svg += `<circle cx="${x}" cy="${rowH / 2}" r="${nodeR}" fill="${color}"/>`;
      svg += `<line x1="${x}" y1="${rowH / 2 + nodeR}" x2="${x}" y2="${rowH}" stroke="${color}" stroke-width="2"/>`;
    } else {
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${rowH}" stroke="${color}" stroke-width="2" opacity="0.55"/>`;
    }
  });
  svg += `</svg>`;
  graphPrevLanes = graphLanes.slice();
  const parents = commit.parents || [];
  const laneColor = graphLanes[idx].color;
  graphLanes.splice(idx, 1);
  if (parents[0]) graphLanes.splice(idx, 0, { hash: parents[0], color: laneColor });
  for (let p = 1; p < parents.length; p++) graphLanes.push({ hash: parents[p], color: graphLanes.length % GRAPH_COLORS.length });
  return svg;
}
window.__solExpCommitDetail = async (hash) => {
  if (!hash) return;
  graphDetailOpen = graphDetailOpen === hash ? "" : hash;
  const rows = document.querySelectorAll(".sol-exp-commit-item");
  rows.forEach((r) => r.classList.toggle("selected", r.getAttribute("data-hash") === graphDetailOpen));
  const detailEl = document.getElementById("sol-exp-commit-detail");
  if (!detailEl) return;
  if (!graphDetailOpen) { detailEl.style.display = "none"; return; }
  detailEl.style.display = "block";
  detailEl.innerHTML = '<div style="color:var(--dsw-alias-label-secondary,#969696)">加载中…</div>';
  try {
    const result = await (await fetch(`/solution-explorer/git-commit-detail?root=${encodeURIComponent(gitRoot())}&hash=${encodeURIComponent(hash)}`)).json();
    if (!result.ok || !result.value) throw new Error(result.error?.message || "加载失败");
    const c = result.value;
    const parentsHtml = (c.parents || []).map((p) => `<span style="font-family:monospace;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${p.substring(0, 8)}</span>`).join(" ") || "—";
    const filesHtml = (c.files || []).slice(0, 60).map((f) => `<div class="sol-exp-commit-detail-file" title="${f.replace(/"/g, "&quot;")}">${escapeHtml(f)}</div>`).join("") || '<div style="padding-left:52px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">（无文件）</div>';
    detailEl.innerHTML = `
      <div class="sol-exp-commit-detail-row"><button class="sol-exp-commit-detail-close" title="关闭" onclick="window.__solExpCommitDetail('${hash}')">✕</button></div>
      <div class="sol-exp-commit-detail-row"><span class="sol-exp-commit-detail-label">commit</span><span class="sol-exp-commit-detail-val" style="font-family:monospace">${c.hash}</span></div>
      <div class="sol-exp-commit-detail-row"><span class="sol-exp-commit-detail-label">author</span><span class="sol-exp-commit-detail-val">${escapeHtml(c.author)} &lt;${escapeHtml(c.email)}&gt;</span></div>
      <div class="sol-exp-commit-detail-row"><span class="sol-exp-commit-detail-label">date</span><span class="sol-exp-commit-detail-val">${new Date(c.timestamp).toLocaleString()}</span></div>
      <div class="sol-exp-commit-detail-row"><span class="sol-exp-commit-detail-label">message</span><span class="sol-exp-commit-detail-val">${escapeHtml(c.message)}</span></div>
      <div class="sol-exp-commit-detail-row"><span class="sol-exp-commit-detail-label">parents</span><span class="sol-exp-commit-detail-val">${parentsHtml}</span></div>
      <div style="padding-top:4px"><span class="sol-exp-commit-detail-label" style="display:inline-block;padding-bottom:2px">files</span><div style="max-height:140px;overflow-y:auto">${filesHtml}</div></div>
      <div style="padding-top:6px"><button class="sol-exp-commit-detail-btn" onclick="window.__solExpCommitCheckout('${hash}')">Checkout</button></div>`;
  } catch (err) {
    detailEl.innerHTML = `<div style="color:var(--dsw-color-error,#f48771)">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
  }
};
window.__solExpCommitCheckout = async (hash) => {
  if (!hash) return;
  const zh = document.documentElement.lang?.startsWith("zh");
  const ok = window.confirm(zh ? `Checkout 到 ${hash.substring(0, 8)}？\n注意：将进入 detached HEAD 状态（不在任何分支上）。` : `Checkout ${hash.substring(0, 8)}?\nNote: this enters a detached HEAD state.`);
  if (!ok) return;
  const result = await (await fetch("/solution-explorer/git-branch-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name: hash }) })).json();
  if (!result.ok) alert(result.error?.message || "切换失败");
  else { await loadGitStatus(); await loadRecentCommits(); }
};
async function loadRemotes() {
  const result = await (await fetch(`/solution-explorer/git-remotes?root=${encodeURIComponent(gitRoot())}`)).json();
  remotesList = result.ok && result.value ? result.value : [];
}
async function loadBranches() {
  const result = await (await fetch(`/solution-explorer/git-branches?root=${encodeURIComponent(gitRoot())}`)).json();
  branchesList = result.ok && result.value ? result.value : [];
}
async function loadTags() {
  const result = await (await fetch(`/solution-explorer/git-tags?root=${encodeURIComponent(gitRoot())}`)).json();
  tagsList = result.ok && result.value ? result.value : [];
}
window.__solExpGitInit = async () => {
  if (!window.confirm(t("scm.init.confirm"))) return;
  const result = await (await fetch("/solution-explorer/git-init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) alert(result.error?.message || "初始化失败");
  else { await loadRepos(); await loadGitStatus(); window.__solExpRefresh(); }
};
window.__solExpFetch = async () => {
  const result = await (await fetch("/solution-explorer/git-fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) showToast(result.error?.message || "抓取失败", true);
  else {
    await loadGitStatus(); await loadBranches();
    const out = (result.value || "").trim();
    showToast(out ? t("scm.sync.fetch") + ":\n" + out : t("scm.sync.upToDate"));
  }
};
window.__solExpPull = async () => {
  if (!window.confirm(t("scm.sync.pullConfirm"))) return;
  const result = await (await fetch("/solution-explorer/git-pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) showToast(result.error?.message || "拉取失败", true);
  else {
    await loadGitStatus(); await loadRecentCommits();
    const out = (result.value || "").trim();
    showToast(out ? t("scm.sync.pull") + ":\n" + out : t("scm.sync.upToDate"));
  }
};
window.__solExpPush = async () => {
  if (!window.confirm(t("scm.sync.pushConfirm"))) return;
  const result = await (await fetch("/solution-explorer/git-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) showToast(result.error?.message || "推送失败", true);
  else {
    await loadGitStatus();
    const out = (result.value || "").trim();
    showToast(out ? t("scm.sync.push") + ":\n" + out : t("scm.sync.done"));
  }
};
window.__solExpSync = async () => {
  if (!window.confirm(t("scm.sync.syncConfirm"))) return;
  const result = await (await fetch("/solution-explorer/git-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) showToast(result.error?.message || "同步失败", true);
  else {
    await loadGitStatus(); await loadRecentCommits();
    const out = (result.value || "").trim();
    showToast(out ? t("scm.sync.sync") + ":\n" + out : t("scm.sync.done"));
  }
};
window.__solExpRemotePanel = async () => { remotePanelOpen = !remotePanelOpen; if (remotePanelOpen) await loadRemotes(); render(); };
window.__solExpRemoteName = (v) => { remoteName = v; };
window.__solExpRemoteUrl = (v) => { remoteUrl = v; };
window.__solExpRemoteAdd = async () => {
  if (!remoteName.trim() || !remoteUrl.trim()) return;
  const result = await (await fetch("/solution-explorer/git-remote-add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name: remoteName.trim(), url: remoteUrl.trim() }) })).json();
  if (!result.ok) alert(result.error?.message || "添加远程失败");
  else { remoteName = ""; remoteUrl = ""; await loadRemotes(); render(); }
};
window.__solExpRemoteRemove = async (name) => {
  if (!window.confirm(t("scm.remote.removeConfirm").replace("{name}", name))) return;
  const result = await (await fetch("/solution-explorer/git-remote-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  if (!result.ok) alert(result.error?.message || "删除远程失败"); else { await loadRemotes(); render(); }
};
window.__solExpRemoteSetUrl = async (name) => {
  const url = window.prompt("新的 URL（" + name + "）");
  if (!url || !url.trim()) return;
  const result = await (await fetch("/solution-explorer/git-remote-set-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name, url: url.trim() }) })).json();
  if (!result.ok) alert(result.error?.message || "修改地址失败"); else await loadRemotes();
};
window.__solExpBranchPanel = async () => { branchPanelOpen = !branchPanelOpen; if (branchPanelOpen) { await loadBranches(); await loadTags(); } render(); };
window.__solExpBranchName = (v) => { branchName = v; };
window.__solExpBranchFrom = (v) => { branchFrom = v; };
window.__solExpBranchCreate = async () => {
  if (!branchName.trim()) return;
  const body: { root: string; name: string; from?: string } = { root: gitRoot(), name: branchName.trim() };
  if (branchFrom.trim()) body.from = branchFrom.trim();
  const result = await (await fetch("/solution-explorer/git-branch-create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  if (!result.ok) alert(result.error?.message || "创建分支失败");
  else { branchName = ""; branchFrom = ""; await loadBranches(); render(); }
};
window.__solExpBranchCheckout = async (name, isRemote) => {
  const result = await (await fetch("/solution-explorer/git-branch-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name, track: isRemote === true }) })).json();
  if (!result.ok) showToast(result.error?.message || "切换失败", true);
  else {
    // Order matters: update state, rebuild the DOM, then load commits into the
    // fresh list node — loading before render() lets render wipe the result
    // and leave the history stuck on "Loading…".
    await loadGitStatus();
    await loadBranches();
    render();
    await loadRecentCommits();
  }
};
window.__solExpBranchDelete = async (name) => {
  if (!window.confirm(t("scm.branch.deleteConfirm").replace("{name}", name))) return;
  let result = await (await fetch("/solution-explorer/git-branch-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  // Safe delete (-d) refuses unmerged branches — offer a forced delete (-D).
  if (!result.ok && String(result.error?.message || "").includes("not fully merged")) {
    const zh = document.documentElement.lang?.startsWith("zh");
    const ok = window.confirm(zh ? "该分支有未合并的提交，确定强制删除？此操作不可撤销。" : "This branch has unmerged commits. Force delete? This cannot be undone.");
    if (!ok) return;
    result = await (await fetch("/solution-explorer/git-branch-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name, force: true }) })).json();
  }
  if (!result.ok) showToast(result.error?.message || "删除失败", true); else { await loadBranches(); render(); }
};
window.__solExpBranchRename = async (name) => {
  const newName = window.prompt(t("scm.branch.newName") + " (" + name + ")");
  if (!newName || !newName.trim()) return;
  const result = await (await fetch("/solution-explorer/git-branch-rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), oldName: name, newName: newName.trim() }) })).json();
  if (!result.ok) alert(result.error?.message || "重命名失败"); else { await loadBranches(); render(); }
};
window.__solExpBranchMerge = async (name) => {
  if (!window.confirm(t("scm.branch.mergeConfirm").replace("{name}", name))) return;
  const result = await (await fetch("/solution-explorer/git-branch-merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  if (!result.ok) alert(result.error?.message || "合并失败"); else { await loadGitStatus(); await loadRecentCommits(); }
};
window.__solExpBranchPublish = async (name) => {
  if (!window.confirm(t("scm.branch.publishConfirm").replace("{name}", name))) return;
  const result = await (await fetch("/solution-explorer/git-branch-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  if (!result.ok) alert(result.error?.message || "发布失败"); else await loadBranches();
};
async function loadRecentCommits() {
					if (!root || !gitStatus || gitStatus.branch === "unknown") return;
					commitsPage = 0;
					commitsAllLoaded = false;
					resetGraph();
					await loadCommitsPage();
				}
				async function loadCommitsPage() {
					if (!root || commitsLoading || commitsAllLoaded) return;
					commitsLoading = true;
					try {
						const url = `/solution-explorer/git-log?root=${encodeURIComponent(gitRoot())}&count=50&skip=${commitsPage * 50}`;
						const result = await (await fetch(url)).json();
						if (result.ok && result.value) {
							const commitsList = document.getElementById("sol-exp-commits-list");
							if (commitsList) {
								if (commitsPage === 0 && result.value.length === 0) {
									commitsList.textContent = t("scm.log.empty");
									commitsAllLoaded = true;
								} else {
									const items = result.value.map((commit) => {
										const graph = renderGraphRow(commit);
										const selected = graphDetailOpen === commit.hash ? " selected" : "";
										return `<div class="sol-exp-commit-item${selected}" data-hash="${commit.hash}" title="${commit.message.replace(/"/g, "&quot;")}" onclick="window.__solExpCommitDetail('${commit.hash}')"><span class="sol-exp-graph">${graph}</span><span class="sol-exp-commit-hash">${commit.shortHash}</span><span class="sol-exp-commit-msg">${escapeHtml(commit.message.substring(0, 60))}${commit.message.length > 60 ? "..." : ""}</span><span class="sol-exp-commit-date">${relTime(commit.timestamp)}</span></div>`;
									}).join("");
									if (commitsPage === 0) commitsList.innerHTML = items;
									else commitsList.insertAdjacentHTML("beforeend", items);
									commitsPage++;
									if (result.value.length < 50) commitsAllLoaded = true;
								}
							}
						}
					} catch (err) {
						console.error("Failed to load commits:", err);
					}
					commitsLoading = false;
				}
				window.__solExpCommitsScroll = (evt) => {
					const el = evt.target as HTMLElement;
					if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
						loadCommitsPage();
					}
				};
async function doStage(files) {

					if (!root) return;

					await fetch("/solution-explorer/git-stage", {

						method: "POST",

						headers: { "Content-Type": "application/json" },

						body: JSON.stringify({

							root: gitRoot(),
														files

						})

					});

					await loadGitStatus();

				}

				async function doUnstage(files) {

					if (!root) return;

					await fetch("/solution-explorer/git-unstage", {

						method: "POST",

						headers: { "Content-Type": "application/json" },

						body: JSON.stringify({

							root: gitRoot(),
														files

						})

					});

					await loadGitStatus();

				}

				async function doDiscard(files) {

					if (!root) return;

					await fetch("/solution-explorer/git-discard", {

						method: "POST",

						headers: { "Content-Type": "application/json" },

						body: JSON.stringify({

							root: gitRoot(),
														files

						})

					});

					await loadGitStatus();

					await loadTree();

				}

				async function doCommit() {

					if (!root || !commitMessage.trim()) return;

					committing = true;

					render();

					try {

						const result = await (await fetch("/solution-explorer/git-commit", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root: gitRoot(),
															message: commitMessage.trim()

							})

						})).json();

						if (result.ok) {

							commitMessage = "";

							await loadGitStatus();

							await loadTree();

						} else alert(t("scm.commitFailed") + ": " + (result.error?.message || ""));

					} catch (err) {

						alert(t("scm.commitFailed") + ": " + err.message);

					}

					committing = false;

					render();

				}

				async function searchFiles(query) {

					searchQuery = query;

					if (!query.trim()) {

						searching = false;

						searchResults = [];

						render();

						return;

					}

					searching = true;

					render();

					try {

						const result = await (await fetch(`/solution-explorer/search?root=${encodeURIComponent(root)}&q=${encodeURIComponent(query)}`)).json();

						if (searchQuery !== query) return;

						if (result.ok) searchResults = result.value;

						render();

					} catch {

						render();

					}

				}

				function buildHTML() {

					const activityBarHTML = `

        <div class="sol-exp-activity">

          <div class="sol-exp-activity-btn ${currentTab === "explorer" ? "active" : ""}" onclick="window.__solExpTab('explorer')" title="${t("panel.explorer")}">

            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h5l1.5 1.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>

          </div>

          <div class="sol-exp-activity-btn ${currentTab === "search" ? "active" : ""}" onclick="window.__solExpTab('search')" title="${t("file.search")}">

            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M9.8 9.8L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>

          </div>

          <div class="sol-exp-activity-btn ${currentTab === "scm" ? "active" : ""}" onclick="window.__solExpTab('scm')" title="${t("panel.scm")}">

            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="3.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="12.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="11.5" cy="7" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 5v5.5M11.5 8.5c0 2.2-1.3 3-4.2 3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>

            ${gitChangesCount > 0 ? `<span class="sol-exp-activity-badge">${gitChangesCount}</span>` : ""}

          </div>

          </div>

      `;

					let contentHTML = "";

					if (currentTab === "scm") contentHTML = buildSCMContent();

					else if (currentTab === "search") contentHTML = buildSearchContent();

					else contentHTML = buildExplorerContent();

					return `

        <div class="sol-exp-panel" ondragover="event.preventDefault()" ondrop="event.preventDefault();window.__solExpDrop('', event)" oncontextmenu="window.__solExpPanelContextMenu(event)">

          <div class="sol-exp-activity">${activityBarHTML}</div>

          <div class="sol-exp-body"><div class="sol-exp-main">${contentHTML}</div></div>

        </div>

      `;

				}

				function buildSearchContent() {

					const searchPlaceholder = t("file.search");

					let contentHTML = "";

					if (searching) if (searchResults.length === 0) contentHTML = `<div class="sol-exp-empty">${document.documentElement.lang?.startsWith("zh") ? "无匹配文件" : "No matching files"}</div>`;

					else contentHTML = "<div class=\"sol-exp-search-results\">" + searchResults.map((r) => {

						const pathJs = r.path.replace(/'/g, "\\'").replace(/\\/g, "\\\\");

						return `

              <div class="sol-exp-search-item ${selectedPath === r.path ? "sol-exp-selected" : ""}"

                   onclick="window.__solExpSelectFile('${pathJs}')"

                   data-sol-exp-path="${escapeHtml(r.path)}"

                   oncontextmenu="event.preventDefault();event.stopPropagation();window.__solExpContextMenu(this.dataset.solExpPath||'', event.pageX, event.pageY)">

                <span class="sol-exp-icon">${r.type === "directory" ? folderIcon(false) : fileIcon(r.name)}</span>

                <span class="sol-exp-name">${escapeHtml(r.name)}</span>

                <span class="sol-exp-path">${escapeHtml(r.path)}</span>

              </div>

            `;

					}).join("") + "</div>";

					else contentHTML = `<div class="sol-exp-empty">${document.documentElement.lang?.startsWith("zh") ? "输入关键词搜索文件" : "Type to search files"}</div>`;

					return `

        <div class="sol-exp-header"><span class="sol-exp-title">${root ? root.split(/[\\\/]/).pop() || root : ""}</span></div>

        <div class="sol-exp-search">

          <svg class="sol-exp-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>

          <input type="text" class="sol-exp-search-input" placeholder="${searchPlaceholder}" value="${searchQuery}" oninput="window.__solExpSearch(this.value)" onkeydown="if(event.key==='Escape'){this.value='';window.__solExpSearch('')}"/>

        </div>

        <div class="sol-exp-content">${contentHTML}</div>

      `;

				}

				function buildExplorerContent() {

					const emptyText = t("panel.empty");

					let contentHTML = "";

					if (loading) contentHTML = `<div class="sol-exp-loading">${t("loading")}</div>`;

					else if (error) contentHTML = `<div class="sol-exp-error">${error}</div>`;

					else if (treeState) contentHTML = "<div class=\"sol-exp-tree\" oncontextmenu=\"event.preventDefault();event.stopPropagation();window.__solExpContextMenu('', event.pageX, event.pageY, false)\" ondragover=\"event.preventDefault();event.stopPropagation()\" ondrop=\"event.preventDefault();event.stopPropagation();window.__solExpDrop('', event)\">" + (treeState.children || []).map((c) => renderTreeNode(c, 0)).join("") + "</div>";

					else contentHTML = `<div class="sol-exp-empty">${emptyText}</div>`;

					return `

        <div class="sol-exp-header">

          <span class="sol-exp-title">${root ? root.split(/[\\\/]/).pop() || root : ""}</span>

          <div class="sol-exp-header-actions">

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpExpandAll()" title="${t("tree.expand")}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h4v4H2V2zm0 8h4v4H2v-4zm8-8h4v4h-4V2zm0 8h4v4h-4v-4z"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpCollapseAll()" title="${t("tree.collapse")}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v2H2V2zm0 5h12v2H2V7zm0 5h12v2H2v-2z"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpNew('file', '')" title="${document.documentElement.lang?.startsWith("zh") ? "新建文件" : "New file"}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M5 2h4l3 3v9H5V2z"/><path d="M9 2v3h3"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpNew('dir', '')" title="${document.documentElement.lang?.startsWith("zh") ? "新建文件夹" : "New folder"}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 4h4l1.5 1.5H14a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpRefresh()" title="${document.documentElement.lang?.startsWith("zh") ? "刷新" : "Refresh"}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a6 6 0 0 1 10.47-4.02L14 5.5V2h1v5h-5V6h2.33A4.5 4.5 0 0 0 3.5 8H2zm12 0a6 6 0 0 1-10.47 4.02L2 10.5V14H1V9h5v1H3.67A4.5 4.5 0 0 0 12.5 8H14z"/></svg></button>

          </div>



        </div>

        <div class="sol-exp-content">${contentHTML}</div>

      `;

				}

				function buildSCMContent() {

					if (!root) return `<div class="sol-exp-content"><div class="sol-exp-empty">${t("panel.empty")}</div></div>`;

					const status = gitStatus;

					const isRepo = status && status.branch !== "unknown";

					const staged = status?.staged || [];

					const unstaged = status?.unstaged || [];

					const untracked = status?.untracked || [];

					const allChanges = [...unstaged, ...untracked];

					if (!isRepo) return `<div class="sol-exp-content"><div class="sol-exp-empty">${t("scm.notRepo")}</div><div style="padding:12px;text-align:center"><button class="sol-exp-commit-btn" style="width:auto;padding:6px 16px" onclick="window.__solExpGitInit()">${t("scm.init.button")}</button></div></div>`;

					let topHTML = "";
					let bottomHTML = "";

					const conflicts = status?.conflicts || [];

					if (conflicts.length > 0) topHTML += `

        <div class="sol-exp-scm-section" data-section="conflicts">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('conflicts')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t("scm.merge.changes")}<span class="sol-exp-scm-header-actions"></span><span class="sol-exp-scm-section-count">${conflicts.length}</span></div>

          ${conflicts.map((item) => buildSCMItem(item, "conflicts")).join("")}

        </div>

      `;

					topHTML += `

        <div class="sol-exp-commit-box">

          <textarea class="sol-exp-commit-input" placeholder="${t("scm.commit.placeholder")}${status?.branch && status.branch !== "unknown" ? " (" + status.branch + ")" : ""}" oninput="window.__solExpCommitMsg(this.value)">${escapeHtml(commitMessage)}</textarea>

          <div class="sol-exp-commit-row">

            <button class="sol-exp-commit-btn" onclick="window.__solExpCommit()" ${committing || !commitMessage.trim() ? "disabled" : ""}>${committing ? t("scm.committing") : t("scm.commit.button")}</button>

          </div>



        </div>

      `;

					topHTML += `

        <div class="sol-exp-scm-section" data-section="changes">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('changes')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t("scm.changes")}<span class="sol-exp-scm-header-actions">

            <button class="sol-exp-hdr-btn" title="${t("scm.refresh")}" onclick="event.stopPropagation();window.__solExpRefreshSCM()"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a6 6 0 0 1 10.47-4.02L14 5.5V2h1v5h-5V6h2.33A4.5 4.5 0 0 0 3.5 8H2zm12 0a6 6 0 0 1-10.47 4.02L2 10.5V14H1V9h5v1H3.67A4.5 4.5 0 0 0 12.5 8H14z"/></svg></button>

            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn" title="${t("scm.stageAll")}" onclick="event.stopPropagation();window.__solExpStageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v12M2 8h12"/></svg></button>` : ""}

            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn danger" title="${t("scm.discardAll")}" onclick="event.stopPropagation();window.__solExpDiscardAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button>` : ""}

          </span><span class="sol-exp-scm-section-count">${allChanges.length}</span></div>

          ${allChanges.length === 0 ? `<div style="padding:4px 12px 8px 24px;font-size:12px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${t("scm.changes.none")}</div>` : ""}

          ${allChanges.map((item) => buildSCMItem(item, "changes")).join("")}

        </div>

      `;

					if (staged.length > 0) topHTML += `

          <div class="sol-exp-scm-section" data-section="staged">

            <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('staged')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t("scm.staged")}<span class="sol-exp-scm-header-actions">

              <button class="sol-exp-hdr-btn" title="${t("scm.unstageAll")}" onclick="event.stopPropagation();window.__solExpUnstageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V3M3.5 7.5L8 3l4.5 4.5"/></svg></button>

            </span><span class="sol-exp-scm-section-count">${staged.length}</span></div>

            ${staged.map((item) => buildSCMItem(item, "staged")).join("")}

          </div>

        `;

					bottomHTML += `

        <div class="sol-exp-scm-section" data-section="repository">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('repository')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t("scm.repository")}<span class="sol-exp-scm-header-actions">
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.fetch")}" onclick="event.stopPropagation();window.__solExpFetch()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v10M4 8l4 4 4-4"/></svg></button>
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.pull")}" onclick="event.stopPropagation();window.__solExpPull()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v10M4 8l4 4 4-4"/><path d="M2 14h12"/></svg></button>
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.push")}" onclick="event.stopPropagation();window.__solExpPush()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V2M4 6l4-4 4 4"/></svg></button>
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.sync")}" onclick="event.stopPropagation();window.__solExpSync()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 0 1 10.47-4.02L14 5.5M14 8a6 6 0 0 1-10.47 4.02L2 10.5"/></svg></button>
          </span><span class="sol-exp-scm-section-count">${(status?.ahead || 0) > 0 || (status?.behind || 0) > 0 ? `↑${status?.ahead || 0} ↓${status?.behind || 0}` : ""}</span></div>

          <div style="padding:4px 12px 8px 24px;flex:1;min-height:0;display:flex;flex-direction:column">

            ${repos.map((r) => `<div class="sol-exp-repo-item ${activeRepo === r.path ? "active" : ""}" onclick="window.__solExpSelectRepo('${r.path.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')"><span class="sol-exp-repo-icon">⑂</span><span class="sol-exp-repo-name">${r.name}</span><span class="sol-exp-repo-branch">${r.branch}</span><span class="sol-exp-hdr-btn" title="${t("scm.remote.title")}" onclick="event.stopPropagation();window.__solExpRemotePanel()"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-1 1"/><path d="M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l1-1"/></svg></button></span><span class="sol-exp-hdr-btn" title="${t("scm.branch.title")}" onclick="event.stopPropagation();window.__solExpBranchPanel()"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11.5" cy="7" r="1.5"/><path d="M5 5v5.5M11.5 8.5c0 2.2-1.3 3-4.2 3"/></svg></button></span></div>`).join("")}<div style="font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:6px">${t("scm.repository.branch")}</div><span class="sol-exp-branch-pill">⑂ ${status?.branch || ""}</span>

            ${remotePanelOpen ? `<div style="margin:6px 0;padding:8px;border:1px solid var(--dsw-alias-border-l2,#333);border-radius:6px;font-size:12px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b>${t("scm.remote.title")}</b><span style="flex:1"></span><button class="sol-exp-commit-detail-close" onclick="window.__solExpRemotePanel()">✕</button></div>${remotesList.length === 0 ? `<div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);padding:2px 0 6px">${t("scm.remote.none")}</div>` : remotesList.map((r) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0"><span style="flex:none;font-weight:600">${escapeHtml(r.name)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#969696)">${escapeHtml(r.url)}</span><button class="sol-exp-commit-detail-btn" onclick="window.__solExpRemoteSetUrl('${r.name.replace(/'/g, "\\'")}')">${t("scm.remote.setUrl")}</button><button class="sol-exp-commit-detail-btn" onclick="window.__solExpRemoteRemove('${r.name.replace(/'/g, "\\'")}')">${t("scm.remote.remove")}</button></div>`).join("")}<div style="display:flex;gap:6px;margin-top:8px"><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:1" placeholder="${t("scm.remote.name")}" value="${escapeHtml(remoteName)}" oninput="window.__solExpRemoteName(this.value)"/><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:2" placeholder="${t("scm.remote.url")} (https://… 或 git@…)" value="${escapeHtml(remoteUrl)}" oninput="window.__solExpRemoteUrl(this.value)"/><button class="sol-exp-commit-detail-btn" onclick="window.__solExpRemoteAdd()">${t("scm.remote.addBtn")}</button></div></div>` : ""}

            ${branchPanelOpen ? `<div style="margin:6px 0;padding:8px;border:1px solid var(--dsw-alias-border-l2,#333);border-radius:6px;font-size:12px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b>${t("scm.branch.title")}</b><span style="flex:1"></span><button class="sol-exp-commit-detail-close" onclick="window.__solExpBranchPanel()">✕</button></div><div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);margin:2px 0">${t("scm.branch.local")}</div>${branchesList.filter((b) => !b.isRemote).map((b) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer" onclick="window.__solExpBranchCheckout('${b.name.replace(/'/g, "\\'")}')"><span style="flex:none;width:14px">${b.current ? "➤" : ""}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${b.current ? "font-weight:600;color:var(--dsw-alias-label-primary)" : ""}">${escapeHtml(b.name)}</span><span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.shortHash ? b.shortHash + " " : ""}${escapeHtml((b.subject || "").substring(0, 24))}</span>${b.upstream ? `<span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${escapeHtml(b.upstream)}</span>` : ""}<button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.rename")}" onclick="event.stopPropagation();window.__solExpBranchRename('${b.name.replace(/'/g, "\\'")}')">✎</button>${!b.current ? `<button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.merge")}" onclick="event.stopPropagation();window.__solExpBranchMerge('${b.name.replace(/'/g, "\\'")}')">⤵</button><button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.publish")}" onclick="event.stopPropagation();window.__solExpBranchPublish('${b.name.replace(/'/g, "\\'")}')">↑</button><button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.delete")}" onclick="event.stopPropagation();window.__solExpBranchDelete('${b.name.replace(/'/g, "\\'")}')">✕</button>` : ""}</div>`).join("")}<div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);margin:4px 0 2px">${t("scm.branch.remote")}</div>${branchesList.filter((b) => b.isRemote).map((b) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer" onclick="window.__solExpBranchCheckout('${b.name.replace(/'/g, "\\'")}', true)"><span style="flex:none;width:14px"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#969696)">${escapeHtml(b.name)}</span><span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.shortHash ? b.shortHash + " " : ""}${escapeHtml((b.subject || "").substring(0, 24))}</span></div>`).join("")}${tagsList.length > 0 ? `<div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);margin:4px 0 2px">${t("scm.branch.tags")}</div>${tagsList.map((tg) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0"><span style="flex:none;width:14px"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#969696)">${escapeHtml(tg.name)}</span><span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tg.commitHash ? escapeHtml((tg.subject || "").substring(0, 24)) : ""}</span></div>`).join("")}` : ""}<div style="display:flex;gap:6px;margin-top:8px"><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:1" placeholder="${t("scm.branch.name")}" value="${escapeHtml(branchName)}" oninput="window.__solExpBranchName(this.value)"/><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:1" placeholder="${t("scm.branch.from")}" value="${escapeHtml(branchFrom)}" oninput="window.__solExpBranchFrom(this.value)"/><button class="sol-exp-commit-detail-btn" onclick="window.__solExpBranchCreate()">${t("scm.branch.createBtn")}</button></div></div>` : ""}

            <div style="font-size:12px;color:var(--dsw-alias-label-secondary)">${t("scm.repository.commits")}</div>

            <div id="sol-exp-commit-detail" style="display:none"></div>

            <div id="sol-exp-commits-list" style="margin-top:6px;font-size:12px;color:var(--dsw-alias-label-tertiary);flex:1;min-height:0;overflow-y:auto" onscroll="window.__solExpCommitsScroll(event)">Loading...</div>

          </div>

        </div>

      `;

					return `<div class="sol-exp-content"><div class="sol-exp-scm-split"><div class="sol-exp-scm-top" style="flex-basis:${scmSplit}%">${topHTML}</div><div class="sol-exp-scm-divider" onpointerdown="window.__solExpScmDividerDown(event)"></div><div class="sol-exp-scm-bottom" style="flex-basis:${100 - scmSplit}%">${bottomHTML}</div></div></div>`;

				}

				function buildSCMItem(item, section) {

					const statusChar = item.status;

					const pathJs = item.path.replace(/'/g, "\\'");

					const action = section === "staged" ? `<button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpUnstage(['${pathJs}'])" title="${t("scm.unstage")}">◦</button>` : section === "conflicts" ? `<button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpStage(['${pathJs}'])" title="标记为已解决">✓</button>` : `<button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpStage(['${pathJs}'])" title="${t("scm.stage")}">+</button>

           <button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpDiscard(['${pathJs}'])" title="${t("scm.discard")}">✕</button>`;

					const staged = section === "staged";

					return `

        <div class="sol-exp-scm-item" title="${t("file.open")}" onclick="window.__solExpOpenDiff('${pathJs}', ${staged})">

          <span class="sol-exp-scm-status sol-exp-git-${statusChar === "?" ? "\\?" : statusChar}">${statusChar}</span>

          <span class="sol-exp-scm-path">${escapeHtml(item.path)}</span>

          <span class="sol-exp-scm-actions">${action}</span>

        </div>

      `;

				}

				// ─── File-type icons (VS Code style, inline SVG) ────────────────
				// Type colors are content colors (like diff +/- and git status hues),
				// intentionally fixed for cross-theme recognition. Badges are white
				// strokes on the colored file outline.

				function folderIcon(open) {
					const color = open ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-label-tertiary)";
					return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.8 3.8h4.2l1.6 1.7h6.6a1 1 0 0 1 1 1v5.8a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1z" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>${open ? `<path d="M4.2 6.2h7.6" stroke="${color}" stroke-width="1" stroke-linecap="round"/>` : ""}</svg>`;
				}

				const FILE_BADGES = {
					code: '<path d="M6.2 6.5L4.5 8.5l1.7 2" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.8 6.5l1.7 2-1.7 2" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M8.4 5l-0.8 7" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>',
					brace: '<path d="M6.2 6.2l-1.6 2.3 1.6 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.8 6.2l1.6 2.3-1.6 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>',
					md: '<path d="M4.5 6.8v4l3.5-4 3.5 4v-4" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>',
					image: '<path d="M3.5 10.8l2.5-3.8 2 2.6 1.5-1.6 2.5 2.8" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><circle cx="10.8" cy="5.8" r="1" stroke="#fff" stroke-width="0.9"/>',
					zip: '<path d="M6.3 5.5h3.4l-3.4 5h3.4" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>',
					hash: '<path d="M7 5.2v5.6M9 5.2v5.6M5.2 6.8h5.6M5.2 9.2h5.6" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>',
					html: '<path d="M6.3 6.2l-1.8 2.3 1.8 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.7 6.2l1.8 2.3-1.8 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M8.3 5l-0.6 7" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>',
					py: '<path d="M7.6 5.2l-3 3.6h6z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M8.4 10.8l3-3.6h-6z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>',
					db: '<path d="M4.5 5.4c0-1 1.6-1.8 3.5-1.8s3.5 0.8 3.5 1.8v5.2c0 1-1.6 1.8-3.5 1.8s-3.5-0.8-3.5-1.8z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M4.5 5.4c0 1 1.6 1.8 3.5 1.8s3.5-0.8 3.5-1.8" stroke="#fff" stroke-width="0.9"/>',
					term: '<path d="M5 6l2.4 2.5L5 11" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.5 11h2.5" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>',
					git: '<path d="M5.5 10.6V4.4" stroke="#fff" stroke-width="1" stroke-linecap="round"/><circle cx="5.5" cy="3.7" r="0.95" stroke="#fff" stroke-width="0.9"/><circle cx="5.5" cy="10.6" r="0.95" stroke="#fff" stroke-width="0.9"/><path d="M5.5 9.4c0 1.3 0.9 1.9 2.2 1.9" stroke="#fff" stroke-width="0.9"/>',
					lines: '<path d="M5 6.2h6M5 8.2h6M5 10.2h4" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
					doc: '<path d="M6.3 5.6l1.7-1.4 1.7 1.4" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 4.2v4.2" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="M5.2 8.8h5.6M5.2 10.6h3.4" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
					lock: '<path d="M5.6 7.4h4.8v3.6a0.8 0.8 0 0 1-0.8 0.8H6.4a0.8 0.8 0 0 1-0.8-0.8z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M6.6 7.4V5.8a1.4 1.4 0 0 1 2.8 0v1.6" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
					vee: '<path d="M8 4.6l-3.2 7h2.1l1.1-2.6 1.1 2.6h2.1z" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>',
				};

				const FILE_ICONS = {
					// code
					"ts": ["#519aba", FILE_BADGES.code], "tsx": ["#519aba", FILE_BADGES.code], "mts": ["#519aba", FILE_BADGES.code],
					"js": ["#d1a11c", FILE_BADGES.code], "jsx": ["#d1a11c", FILE_BADGES.code], "mjs": ["#d1a11c", FILE_BADGES.code], "cjs": ["#d1a11c", FILE_BADGES.code],
					"vue": ["#42b883", FILE_BADGES.vee],
					// config
					"json": ["#e2b714", FILE_BADGES.brace], "yaml": ["#e2b714", FILE_BADGES.brace], "yml": ["#e2b714", FILE_BADGES.brace], "toml": ["#e2b714", FILE_BADGES.brace], "ini": ["#e2b714", FILE_BADGES.brace], "conf": ["#e2b714", FILE_BADGES.brace], "env": ["#e2b714", FILE_BADGES.brace], "editorconfig": ["#e2b714", FILE_BADGES.brace],
					// docs
					"md": ["#c586c0", FILE_BADGES.md], "mdx": ["#c586c0", FILE_BADGES.md], "markdown": ["#c586c0", FILE_BADGES.md],
					"txt": ["#969696", FILE_BADGES.lines], "log": ["#969696", FILE_BADGES.lines], "text": ["#969696", FILE_BADGES.lines],
					"pdf": ["#ff6b6b", FILE_BADGES.doc], "doc": ["#2b579a", FILE_BADGES.doc], "docx": ["#2b579a", FILE_BADGES.doc], "xls": ["#217346", FILE_BADGES.doc], "xlsx": ["#217346", FILE_BADGES.doc], "ppt": ["#d24726", FILE_BADGES.doc], "pptx": ["#d24726", FILE_BADGES.doc],
					// media
					"png": ["#4ec9b0", FILE_BADGES.image], "jpg": ["#4ec9b0", FILE_BADGES.image], "jpeg": ["#4ec9b0", FILE_BADGES.image], "gif": ["#4ec9b0", FILE_BADGES.image], "webp": ["#4ec9b0", FILE_BADGES.image], "svg": ["#4ec9b0", FILE_BADGES.image], "ico": ["#4ec9b0", FILE_BADGES.image], "bmp": ["#4ec9b0", FILE_BADGES.image],
					"ttf": ["#c586c0", FILE_BADGES.doc], "otf": ["#c586c0", FILE_BADGES.doc], "woff": ["#c586c0", FILE_BADGES.doc], "woff2": ["#c586c0", FILE_BADGES.doc],
					// archive
					"zip": ["#cc8800", FILE_BADGES.zip], "tgz": ["#cc8800", FILE_BADGES.zip], "tar": ["#cc8800", FILE_BADGES.zip], "gz": ["#cc8800", FILE_BADGES.zip], "7z": ["#cc8800", FILE_BADGES.zip], "rar": ["#cc8800", FILE_BADGES.zip],
					// web & style
					"html": ["#e44d26", FILE_BADGES.html], "htm": ["#e44d26", FILE_BADGES.html], "xhtml": ["#e44d26", FILE_BADGES.html],
					"css": ["#519aba", FILE_BADGES.hash], "scss": ["#519aba", FILE_BADGES.hash], "less": ["#519aba", FILE_BADGES.hash],
					// data & scripts
					"py": ["#3572a5", FILE_BADGES.py], "python": ["#3572a5", FILE_BADGES.py],
					"sql": ["#569cd6", FILE_BADGES.db], "db": ["#569cd6", FILE_BADGES.db], "csv": ["#569cd6", FILE_BADGES.db], "tsv": ["#569cd6", FILE_BADGES.db], "parquet": ["#569cd6", FILE_BADGES.db],
					"sh": ["#f14c4c", FILE_BADGES.term], "bash": ["#f14c4c", FILE_BADGES.term], "zsh": ["#f14c4c", FILE_BADGES.term], "ps1": ["#f14c4c", FILE_BADGES.term], "bat": ["#f14c4c", FILE_BADGES.term], "cmd": ["#f14c4c", FILE_BADGES.term],
					// git & misc
					"gitignore": ["#6e6e6e", FILE_BADGES.git], "gitattributes": ["#6e6e6e", FILE_BADGES.git], "gitmodules": ["#6e6e6e", FILE_BADGES.git], "gitconfig": ["#6e6e6e", FILE_BADGES.git],
					"lock": ["#d7a94e", FILE_BADGES.lock], "lockb": ["#d7a94e", FILE_BADGES.lock],
					"bin": ["#8a8a8a", FILE_BADGES.lines], "so": ["#8a8a8a", FILE_BADGES.lines], "dll": ["#8a8a8a", FILE_BADGES.lines], "exe": ["#8a8a8a", FILE_BADGES.lines],
					"_default": ["#d4d4d4", ""],
				};

				function fileIcon(name) {
					const ext = (name.includes(".") ? name.split(".").pop() : name).toLowerCase();
					const [color, badge] = FILE_ICONS[ext] || FILE_ICONS["_default"];
					return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 1.8h6.2l2.5 2.5v9.4a0.8 0.8 0 0 1-0.8 0.8H3.8a0.8 0.8 0 0 1-0.8-0.8V2.6a0.8 0.8 0 0 1 0.8-0.8z" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.7 1.8v2.5h2.5" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>${badge}</svg>`;
				}

				function renderTreeNode(node, depth) {

					if (!node) return "";

					const isDir = node.type === "directory";

					const isExpanded = expandedPaths.has(node.path);

					const isSelected = selectedPaths.has(node.path);

					const isCut = clipboard?.mode === "cut" && clipboard.paths.includes(node.path);

					const isDropTarget = isDir && dropTargetPath === node.path && dragPaths.length > 0;

					const hasChildren = isDir && node.children && node.children.length > 0;

					const padding = 12 + depth * 16;

					// Map git status letters that are not CSS-safe to stable class
					// suffixes: '?' -> q (untracked), '!' -> x (ignored/excluded).
					const gitCls = node.gitStatus ? (node.gitStatus === "?" ? "q" : node.gitStatus === "!" ? "x" : node.gitStatus) : "";

					const pathJs = node.path.replace(/'/g, "\\'").replace(/\\/g, "\\\\");

					const chevron = isDir ? hasChildren ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="transform:${isExpanded ? "rotate(90deg)" : "rotate(0deg)"};transition:transform .15s ease"><path d="M6 4l4 4-4 4"/></svg>` : "<span style=\"width:16px;display:inline-block\"></span>" : "<span style=\"width:16px;display:inline-block\"></span>";

					const icon = isDir ? folderIcon(isExpanded) : fileIcon(node.name);

					const childrenHTML = isDir && isExpanded && hasChildren ? `<div class="sol-exp-tree-children">${node.children.map((c) => renderTreeNode(c, depth + 1)).join("")}</div>` : "";

					return `

        <div class="sol-exp-tree-node-wrapper">

          <div class="sol-exp-tree-node ${isSelected ? "sol-exp-selected" : ""}${isCut ? " sol-exp-cut" : ""}${isDropTarget ? " sol-exp-drop-target" : ""}"

               style="padding-left:${padding}px"

               draggable="true"

               onclick="window.__solExpSelect('${pathJs}', event.shiftKey, event.ctrlKey || event.metaKey, ${isDir})"

               ${isDir ? "" : `ondblclick="window.__solExpOpenFile('${pathJs}')"`}

               ondragstart="window.__solExpDragStart('${pathJs}')"

               ${isDir ? `ondragover="event.preventDefault();event.stopPropagation();window.__solExpDragOver('${pathJs}')" ondrop="event.preventDefault();event.stopPropagation();window.__solExpDrop('${pathJs}', event)"` : ""}

               data-sol-exp-path="${escapeHtml(node.path)}"

               data-sol-exp-isdir="${isDir ? "1" : "0"}"

               oncontextmenu="event.preventDefault();event.stopPropagation();window.__solExpContextMenu(this.dataset.solExpPath||'', event.pageX, event.pageY, this.dataset.solExpIsdir === '1')">

            <span class="sol-exp-chevron">${chevron}</span>

            <span class="sol-exp-file-icon">${icon}</span>

            <span class="sol-exp-file-name${gitCls ? " sol-exp-git-" + gitCls : ""}">${escapeHtml(node.name)}</span>

            ${node.gitStatus ? `<span class="sol-exp-git-letter sol-exp-git-${gitCls}">${node.gitStatus}</span>` : ""}

          </div>

          ${childrenHTML}

        </div>

      `;

				}

				function escapeHtml(str) {

					return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\\\\/g, "\\92;");

				}

				let searchTimer;

				window.__solExpTab = (tab) => {

					currentTab = tab;

					render();

					if (tab === "scm") loadGitStatus();

				};

				window.__solExpToggleExpand = (path) => {

					if (expandedPaths.has(path)) expandedPaths.delete(path);

					else expandedPaths.add(path);

					render();

				};

				window.__solExpSelectFile = async (path) => {

					selectedPath = path;

					if (typeof window.__solExpOpenFile === "function") window.__solExpOpenFile(path);

				};

				window.__solExpClearSelection = () => {

					if (selectedPaths.size || selectedPath) {

						selectedPaths = /* @__PURE__ */ new Set<string>();

						selectionAnchor = null;

						selectedPath = null;

						render();

					}

				};

				window.__solExpSelect = (path, shift, ctrl, isDir) => {

					if (ctrl) {

						if (selectedPaths.has(path)) selectedPaths.delete(path);

						else selectedPaths.add(path);

						selectionAnchor = path;

					} else if (shift && selectionAnchor) {

						const order = [];

						const collect = (n) => {

							order.push(n.path);

							for (const c of n.children || []) collect(c);

						};

						if (treeState) collect(treeState);

						const a = order.indexOf(selectionAnchor), b = order.indexOf(path);

						if (a >= 0 && b >= 0) {

							const [lo, hi] = a < b ? [a, b] : [b, a];

							selectedPaths = new Set(order.slice(lo, hi + 1));

						} else {

							selectedPaths = /* @__PURE__ */ new Set([path]);

							selectionAnchor = path;

						}

					} else {

						selectedPaths = /* @__PURE__ */ new Set([path]);

						selectionAnchor = path;

					}

					selectedPath = path;

					if (isDir) if (expandedPaths.has(path)) expandedPaths.delete(path);

					else expandedPaths.add(path);

					render();

				};

				window.__solExpCopy = () => {

					if (selectedPaths.size) {

						clipboard = {

							paths: [...selectedPaths],

							mode: "copy"

						};

						render();

					}

				};

				window.__solExpCut = () => {

					if (selectedPaths.size) {

						clipboard = {

							paths: [...selectedPaths],

							mode: "cut"

						};

						render();

					}

				};

				window.__solExpPaste = async (target) => {

					if (!clipboard || !clipboard.paths.length || !root) return;

					const { paths, mode } = clipboard;

					clipboard = null;

					let targetDir = target;

					if (targetDir) {

						const find = (n) => {

							if (n.path === target) return n;

							for (const c of n.children || []) {

								const f = find(c);

								if (f) return f;

							}

							return null;

						};

						const node = treeState ? find(treeState) : null;

						if (!node || node.type !== "directory") {

							const i = targetDir.lastIndexOf("/");

							targetDir = i > 0 ? targetDir.slice(0, i) : "";

						}

					}

					const norm = (p) => p.replace(/\\/g, "/");

					for (const raw of paths) {

						const src = norm(raw);

						const tgt = norm(targetDir);

						const parent = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";

						if (mode === "cut" && parent === tgt) {

							alert("已在目标目录，无需移动");

							return;

						}

						if (tgt && (tgt === src || tgt.startsWith(src + "/"))) {

							alert("不能移动到自身内部");

							return;

						}

					}

					let done = 0, failed = 0;

					for (const src of paths) try {

						const result = await (await fetch("/solution-explorer/paste", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root,

								mode,

								source: src,

								targetDir

							})

						})).json();

						if (result.ok) done++;

						else {

							failed++;

							console.warn("[sol-exp] paste failed", src, result.error);

						}

					} catch (err) {

						failed++;

						console.warn("[sol-exp] paste error", src, err);

					}

					if (failed) alert(failed + " 项粘贴失败");

					render();

					loadTree();

					loadGitStatus();

				};

				window.__solExpNew = async (type, dir) => {

					if (!root) return;

					const name = window.prompt(type === "file" ? "输入文件名" : "输入文件夹名");

					if (!name || !name.trim()) return;

					const clean = name.trim();

					const rel = dir ? dir.replace(/\\/g, "/") + "/" + clean : clean;

					try {

						const result = await (await fetch("/solution-explorer/create", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root,

								path: rel,

								type

							})

						})).json();

						if (!result.ok) {

							alert("创建失败: " + (result.error?.message || ""));

							return;

						}

						loadTree();

						loadGitStatus();

					} catch (err) {

						alert("创建失败: " + (err.message || String(err)));

					}

				};

				window.__solExpDragStart = (path) => {

					dragPaths = selectedPaths.has(path) ? [...selectedPaths] : [path];

				};

				window.__solExpDragOver = (path, evt) => {

					const clear = () => document.querySelectorAll(".sol-exp-drop-target").forEach((el) => el.classList.remove("sol-exp-drop-target"));

					clear();

					if (dragPaths.length && !dragPaths.includes(path)) {

						const node = (evt.target as HTMLElement)?.closest(".sol-exp-tree-node");

						if (node) node.classList.add("sol-exp-drop-target");

					}

					dropTargetPath = path;

				};

				window.__solExpDrop = async (path, evt) => {

					const files = evt.dataTransfer?.files;

					if (files && files.length > 0) {

						await window.__solExpDropFiles(path, files);

						return;

					}

					const targetDir = path;

					const sources = dragPaths;

					dragPaths = [];

					dropTargetPath = null;

					document.querySelectorAll(".sol-exp-drop-target").forEach((el) => el.classList.remove("sol-exp-drop-target"));

					if (!root || !sources.length) {

						render();

						return;

					}

					{

						const norm = (p) => p.replace(/\\/g, "/");

						const tgt = norm(targetDir);

						for (const raw of sources) {

							const src = norm(raw);

							const parent = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";

							if (src === tgt || tgt.startsWith(src + "/")) {

								alert("不能移动到自身内部");

								render();

								return;

							}

							if (parent === tgt) {

								alert("已在目标目录，无需移动");

								render();

								return;

							}

						}

					}

					let done = 0, failed = 0;

					for (const src of sources) try {

						const result = await (await fetch("/solution-explorer/move", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root,

								source: src,

								targetDir

							})

						})).json();

						if (result.ok) done++;

						else {

							failed++;

							console.warn("[sol-exp] move failed", src, result.error);

						}

					} catch (err) {

						failed++;

						console.warn("[sol-exp] move error", src, err);

					}

					if (failed) alert(failed + " 项移动失败");

					render();

					loadTree();

					loadGitStatus();

				};

				const bytesToBase64 = (bytes) => {

					let binary = "";

					const chunk = 32768;

					for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));

					return btoa(binary);

				};

				window.__solExpDropFiles = async (target, files) => {

					const targetDir = target || "";

					let done = 0, failed = 0, skipped = 0;

					for (const f of Array.from(files)) {

						if (f.size > 50 * 1024 * 1024) {

							skipped++;

							alert("文件过大（>50MB）跳过: " + f.name);

							continue;

						}

						try {

							const bytes = new Uint8Array(await f.arrayBuffer());

							const binary = bytes.subarray(0, Math.min(4096, bytes.length)).includes(0);

							const content = binary ? bytesToBase64(bytes) : new TextDecoder("utf-8").decode(bytes);

							const rel = targetDir ? targetDir + "/" + f.name : f.name;

							const result = await (await fetch("/solution-explorer/upload", {

								method: "POST",

								headers: { "Content-Type": "application/json" },

								body: JSON.stringify({

									root,

									path: rel,

									content,

									binary

								})

							})).json();

							if (result.ok) done++;

							else {

								failed++;

								console.warn("[sol-exp] upload failed", f.name, result.error);

							}

						} catch (err) {

							failed++;

							console.warn("[sol-exp] upload error", f.name, err);

						}

					}

					if (failed) alert(failed + " 个文件上传失败");

					render();

					loadTree();

					loadGitStatus();

				};

				window.__solExpCollapseAll = () => {

					expandedPaths = /* @__PURE__ */ new Set<string>();

					render();

				};

				window.__solExpExpandAll = () => {

					const paths = /* @__PURE__ */ new Set<string>();

					const collect = (n) => {

						if (n?.type === "directory") {

							paths.add(n.path);

							for (const c of n.children || []) collect(c);

						}

					};

					if (treeState) collect(treeState);

					expandedPaths = paths;

					render();

				};

				window.__solExpRefresh = () => {

					loadTree();

					loadGitStatus();

				};

				window.__solExpClearSearch = () => {

					searchQuery = "";

					searching = false;

					searchResults = [];

					render();

				};

				window.__solExpSearch = (query) => {

					if (searchTimer) clearTimeout(searchTimer);

					searchTimer = setTimeout(() => searchFiles(query), 300);

				};

				window.__solExpRefreshSCM = () => {

					loadGitStatus();

				};

				window.__solExpCommitMsg = (msg) => {

					commitMessage = msg;

					render();

				};

				window.__solExpCommit = () => {

					doCommit();

				};

				window.__solExpStage = (files) => {

					doStage(files);

				};

				window.__solExpUnstage = (files) => {

					doUnstage(files);

				};

				window.__solExpDiscard = (files) => {

					doDiscard(files);

				};

				window.__solExpStageAll = () => {

					const all = [...gitStatus?.unstaged || [], ...gitStatus?.untracked || []].map((i) => i.path);

					if (all.length) doStage(all);

				};

				window.__solExpUnstageAll = () => {

					const all = (gitStatus?.staged || []).map((i) => i.path);

					if (all.length) doUnstage(all);

				};

				window.__solExpDiscardAll = () => {

					const all = [...gitStatus?.unstaged || [], ...gitStatus?.untracked || []].map((i) => i.path);

					if (all.length && window.confirm(t("scm.discardAllConfirm"))) doDiscard(all);

				};

				let contextMenuEl = null;

				function hideContextMenu() {

					if (contextMenuEl) {

						contextMenuEl.remove();

						contextMenuEl = null;

					}

				}

				document.addEventListener("click", hideContextMenu);

				const dragGuard = (e) => {

					if (activeEl?.contains(e.target)) e.preventDefault();

				};

				document.addEventListener("dragenter", dragGuard);

				document.addEventListener("dragover", dragGuard);

				document.addEventListener("drop", dragGuard);

				document.addEventListener("click", (e) => {

					if (!activeEl?.contains(e.target)) return;

					const el = e.target as HTMLElement;

					if (el.closest(".sol-exp-tree-node") || el.closest(".sol-exp-search-item") || el.closest(".sol-exp-scm-item") || el.closest(".sol-exp-context-menu")) return;

					if (selectedPaths.size || selectedPath) {

						selectedPaths = /* @__PURE__ */ new Set<string>();

						selectionAnchor = null;

						selectedPath = null;

						render();

					}

				});

				document.addEventListener("dragend", () => {

					if (dragPaths.length || dropTargetPath) {

						dragPaths = [];

						dropTargetPath = null;

						render();

					}

				});

				window.__solExpPanelContextMenu = (evt) => {

					evt.preventDefault();

					const el = evt.target as HTMLElement;

					if (el && (el.closest(".sol-exp-header") || el.closest(".sol-exp-activity") || el.closest(".sol-exp-commit-box"))) return;

					window.__solExpContextMenu("", evt.pageX, evt.pageY, false);

				};

				window.__solExpContextMenu = (target, x, y, isDir = false) => {

					hideContextMenu();

					if (target && !selectedPaths.has(target)) {

						selectedPaths = /* @__PURE__ */ new Set([target]);

						selectionAnchor = target;

						selectedPath = target;

					}

					const menu = document.createElement("div");

					menu.className = "sol-exp-context-menu";

					menu.style.left = Math.min(x, window.innerWidth - 160) + "px";

					menu.style.top = Math.min(y, window.innerHeight - 80) + "px";

					menu.addEventListener("click", (e) => e.stopPropagation());

					menu.addEventListener("contextmenu", (e) => e.preventDefault());

					const addItem = (label, danger, onClick) => {

						const item = document.createElement("div");

						item.className = "sol-exp-context-menu-item" + (danger ? " danger" : "");

						item.textContent = label;

						item.addEventListener("click", () => {

							hideContextMenu();

							onClick();

						});

						menu.appendChild(item);

					};

					const targets = target && selectedPaths.has(target) ? [...selectedPaths] : target ? [target] : [];

					const base = isDir ? target : target ? target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : target.includes("\\") ? target.slice(0, target.lastIndexOf("\\")) : "" : "";

					addItem("新建文件", false, () => window.__solExpNew("file", base));

					addItem("新建文件夹", false, () => window.__solExpNew("dir", base));

					if (targets.length) {

						addItem("复制", false, () => {

							window.__solExpCopy();

						});

						addItem("剪切", false, () => {

							window.__solExpCut();

						});

						addItem("删除 (" + targets.length + ")", true, () => window.__solExpDeletePaths(targets));

						addItem("复制相对路径", false, () => navigator.clipboard.writeText(targets.join("\n")));

						addItem("复制绝对路径", false, () => {

							const sep = root.endsWith("/") || root.endsWith("\\") ? "" : "/";

							navigator.clipboard.writeText(targets.map((p) => root + sep + p).join("\n"));

						});

					}

					if (clipboard && clipboard.paths.length) addItem("粘贴到此处" + (clipboard.mode === "cut" ? "（剪切）" : ""), false, () => window.__solExpPaste(isDir ? target : target || ""));

					if (menu.childNodes.length === 0) return;

					document.body.appendChild(menu);

					contextMenuEl = menu;

				};

				window.__solExpDeletePaths = async (paths) => {

					if (!root || !paths.length) return;

					if (!window.confirm("确定删除 " + paths.length + " 项？")) return;

					let done = 0, failed = 0;

					for (const p of paths) try {

						const result = await (await fetch("/solution-explorer/delete", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root,

								path: p

							})

						})).json();

						if (result.ok) done++;

						else {

							failed++;

							console.warn("[sol-exp] delete failed", p, result.error);

						}

					} catch (err) {

						failed++;

						console.warn("[sol-exp] delete error", p, err);

					}

					for (const p of paths) selectedPaths.delete(p);

					if (failed) alert(failed + " 项删除失败");

					render();

					loadTree();

					loadGitStatus();

				};

				window.__solExpDeleteFile = async (target) => {

					if (target) await window.__solExpDeletePaths([target]);

				};

				window.__solExpToggleSection = (id) => {

					const el = document.querySelector(`[data-section="${id}"]`);

					if (el) el.classList.toggle("collapsed");

				};

				window.__solExpScmDividerDown = (e) => {
				e.preventDefault();
				const split = document.querySelector(".sol-exp-scm-split");
				const top = document.querySelector(".sol-exp-scm-top") as HTMLElement;
				const bottom = document.querySelector(".sol-exp-scm-bottom") as HTMLElement;
				if (!split || !top || !bottom) return;
				const rect = split.getBoundingClientRect();
				const startY = e.clientY;
				const startSplit = scmSplit;
				const onMove = (me) => {
				const dy = me.clientY - startY;
				scmSplit = Math.min(85, Math.max(15, startSplit + (dy / rect.height) * 100));
				top.style.flexBasis = scmSplit + "%";
				bottom.style.flexBasis = (100 - scmSplit) + "%";
				};
				const onUp = () => {
				document.removeEventListener("pointermove", onMove);
				document.removeEventListener("pointerup", onUp);
				};
				document.addEventListener("pointermove", onMove);
				document.addEventListener("pointerup", onUp);
				};

				const PANEL_WIDTH = 280;

				const PANEL_MIN = 264;

				const PANEL_MAX = 420;

				let panelWidth = 0;
				let scmSplit = 55;

				let panelFrame = null;

				let panelCol = null;

				let shellTracks = [];
				let lastGridApplied = "";

				let styleObs = null;

				let sizeObs = null;

				let resizeHandle = null;

				function parseGridTracks(input) {

					const tracks = [];

					let depth = 0;

					let current = "";

					for (const char of input) {

						if (char === "(") depth++;

						if (char === ")") depth = Math.max(0, depth - 1);

						if (char === " " && depth === 0) {

							if (current !== "") {

								tracks.push(current);

								current = "";

							}

							continue;

						}

						current += char;

					}

					if (current !== "") tracks.push(current);

					return tracks;

				}

				function trackPx(track) {

					const m = /^(-?[\\d.]+)px$/.exec(track.trim());

					return m === null ? 0 : Number(m[1]);

				}

				function clampPanelWidth(px) {

					return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(px)));

				}

				function findFrame() {

					const s = document.querySelector("[data-dsh-frame]");

					if (s !== null) return s;

					return document.querySelector("[class*=\"sidebarCol\"]")?.parentElement ?? null;

				}

				function applyGrid() {

					if (panelFrame === null || shellTracks.length < 3) return;

					const value = `${shellTracks[0]} minmax(0, 1fr) ${shellTracks[2]} ${Math.round(panelWidth)}px`;
					panelFrame.style.gridTemplateColumns = value;
					lastGridApplied = value;

					if (panelCol !== null) panelCol.style.visibility = panelWidth > 0 ? "visible" : "hidden";

					if (resizeHandle !== null) {
						const w = panelFrame.getBoundingClientRect().width;
						const handleLeft = w - panelWidth - 3;
						// The panel grabber and the shell sidebar grabber both
						// sit on 8px hit strips; once the chat column is
						// squeezed away they overlap, and the later-appended
						// panel grabber wins the pointer. Disable it there so
						// the sidebar drag keeps full control.
						const overlapped = handleLeft - 4 <= (trackPx(shellTracks[0]) || 0) + 4;
						resizeHandle.style.left = handleLeft + "px";
						resizeHandle.style.pointerEvents = overlapped ? "none" : "auto";
						resizeHandle.dataset.overlapped = overlapped ? "true" : "false";
					}
				}
function mountColumn() {

					if (panelFrame !== null) return;

					const frame = findFrame();

					if (frame === null) return;

					panelFrame = frame;

					panelCol = document.createElement("div");

					panelCol.dataset.solutionExplorer = "";

					panelCol.style.minWidth = "0";

					panelCol.style.overflow = "hidden";

					panelCol.style.display = "flex";

					panelCol.style.flexDirection = "column";

					panelCol.style.borderLeft = "1px solid var(--dsw-alias-border-l2, #333)";

					frame.appendChild(panelCol);

					activeEl = panelCol;

					render();

					panelCol.addEventListener("dragenter", (e) => e.stopPropagation());

					panelCol.addEventListener("dragover", (e) => e.stopPropagation());

					panelCol.addEventListener("drop", (e) => e.stopPropagation());

					resizeHandle = document.createElement("div");

					resizeHandle.className = "sol-exp-resize-handle";

					resizeHandle.addEventListener("pointerdown", (e) => {

						e.preventDefault();

						resizeHandle.dataset.dragging = "true";

						resizeHandle.setPointerCapture(e.pointerId);

						const startX = e.clientX;

						const startWidth = panelWidth;

						let dragging = false;

						const onMove = (me) => {

							const dx = me.clientX - startX;

							// Ignore sub-threshold jitter: a bare click on the
							// grabber (or a tiny pointer wobble) must not nudge
							// the panel width the wrong way.
							if (!dragging && Math.abs(dx) < 4) return;

							dragging = true;

							panelWidth = clampPanelWidth(startWidth - dx);

							applyGrid();

						};

						const onUp = () => {

							resizeHandle.removeEventListener("pointermove", onMove);

							resizeHandle.removeEventListener("pointerup", onUp);

							resizeHandle.dataset.dragging = void 0;

						};

						resizeHandle.addEventListener("pointermove", onMove);

						resizeHandle.addEventListener("pointerup", onUp);

					});

					frame.appendChild(resizeHandle);

					applyGrid();

										const syncGrid = () => {

						if (panelFrame === null) return;

						const inline = panelFrame.style.gridTemplateColumns;
						if (inline === "" || inline === lastGridApplied) return;

						const tracks = parseGridTracks(inline);
						if (tracks.length >= 2) {
							shellTracks = tracks.length >= 3 ? tracks.slice(0, 3) : [...tracks, "minmax(0, 1fr)"];
							applyGrid();
						}
					};
styleObs = new MutationObserver(syncGrid);

					styleObs.observe(frame, {

						attributes: true,

						attributeFilter: ["style"]

					});

					sizeObs = new ResizeObserver(() => {

						applyGrid();

					});

					sizeObs.observe(frame);

					const initial = (frame as HTMLElement).style.gridTemplateColumns;

					if (initial !== "") {

						const tracks = parseGridTracks(initial);

						if (tracks.length >= 2 && tracks.length <= 3) shellTracks = tracks;

						else if (tracks.length === 4 && trackPx(tracks[0]) > 0) shellTracks = tracks.slice(0, 3);

					}

					applyGrid();

				}

				let mountObs = null;

				function waitForFrame() {

					mountColumn();

					if (panelFrame !== null) return;

					mountObs = new MutationObserver(() => {

						mountColumn();

						if (panelFrame !== null) mountObs?.disconnect();

					});

					mountObs.observe(document.body, {

						childList: true,

						subtree: true

					});

				}

				function handleSessionChange() {

					const snapshot = ctx.sessions.list.getSnapshot();

					const sessionId = snapshot.current;

					const cwd = sessionId === void 0 ? void 0 : snapshot.byId[sessionId]?.cwd;

					const newRoot = typeof cwd === "string" && cwd !== "" ? cwd : "";

					// The snapshot fires on any session-list change; only a
					// cwd switch may reset the panel width, otherwise a live
					// session event during a drag would snap the panel back
					// to its default (a "wrong direction" jump).
					if (newRoot === root) return;

					panelWidth = newRoot !== "" ? PANEL_WIDTH : 0;

					if (panelFrame !== null) applyGrid();

					root = newRoot;

					treeState = null;

					gitStatus = null;

					gitChangesCount = 0;

					loading = root !== "";

					render();

					if (root) {

						activeRepo = "";

						loadTree();

						loadRepos();

						loadGitStatus();

					}

				}

				const unsub = ctx.sessions.list.subscribe(handleSessionChange);

				handleSessionChange();

				waitForFrame();

				console.log("[sol-exp] injecting __solExpOpenFile");

				window.__solExpOpenFile = async (path) => {

					_diffPath = null;

					_diffContent = null;

					_diffLoading = false;

					_notifyDiffListeners();

					_editorFile = path;

					_editorContent = null;

					_editorLoading = true;

					_editorError = null;

					_editorUnsupported = false;

					_notifyEditorListeners();

					try {

						const result = await (await fetch("/solution-explorer/read?root=" + encodeURIComponent(root) + "&file=" + encodeURIComponent(path))).json();

						if (result.ok) if (result.value.supported === false) {

							_editorUnsupported = true;

							_editorContent = null;

						} else _editorContent = result.value.content;

						else _editorError = result.error?.message || "Failed to read file";

					} catch (err) {

						_editorError = err.message || String(err);

					}

					_editorLoading = false;

					_notifyEditorListeners();

					setTimeout(() => {

						const tab = Array.from(document.querySelectorAll("[role=\"tab\"]")).find((el) => el.textContent === (document.documentElement.lang?.startsWith("zh") ? "编辑" : "Edit")) as HTMLElement | null;

						if (tab) tab.click();

					}, 50);

				};

				window.__solExpSaveFile = async () => {

					if (!_editorFile || _editorContent === null) return;

					_editorSaving = true;

					_notifyEditorListeners();

					try {

						const result = await (await fetch("/solution-explorer/write", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root,

								path: _editorFile,

								content: _editorContent

							})

						})).json();

						if (!result.ok) alert("保存失败: " + (result.error?.message || ""));

					} catch (err) {

						alert("保存失败: " + (err.message || String(err)));

					}

					_editorSaving = false;

					_notifyEditorListeners();

				};

				window.__solExpGetEditorState = () => ({

					editorFile: _editorFile,

					editorContent: _editorContent,

					editorLoading: _editorLoading,

					editorError: _editorError,

					editorSaving: _editorSaving,

					editorUnsupported: _editorUnsupported

				});

				window.__solExpEditorListeners = _editorListeners;

				window.__solExpOpenDiff = async (path, staged) => {

					_diffPath = path;

					_diffStaged = staged;

					_diffRoot = root;

					_diffContent = null;

					_diffOldContent = "";

					_diffNewContent = "";

					_diffLoading = true;

					_notifyDiffListeners();

					try {

						const result = await (await fetch("/solution-explorer/git-diff?root=" + encodeURIComponent(gitRoot()) + "&file=" + encodeURIComponent(path) + "&staged=" + staged)).json();

						if (result.ok) { _diffContent = result.value.diff ?? result.value; _diffOldContent = result.value.oldContent ?? ""; _diffNewContent = result.value.newContent ?? "" }

						else { _diffContent = null; _diffOldContent = ""; _diffNewContent = "" }

					} catch {

						_diffContent = null;

						_diffOldContent = "";

						_diffNewContent = "";

					}

					_diffLoading = false;

					_notifyDiffListeners();

					setTimeout(() => {

						const tab = Array.from(document.querySelectorAll("[role=\"tab\"]")).find((el) => el.textContent === (document.documentElement.lang?.startsWith("zh") ? "编辑" : "Edit")) as HTMLElement | null;

						if (tab) tab.click();

					}, 50);

				};

				window.__solExpGetDiffState = () => ({

					diffPath: _diffPath,

					diffStaged: _diffStaged,

					diffContent: _diffContent,

					diffOldContent: _diffOldContent,

					diffNewContent: _diffNewContent,

					diffLoading: _diffLoading,

					diffRoot: _diffRoot

				});

				window.__solExpDiffListeners = _diffListeners;

				return () => {

					unsub();

					styleObs?.disconnect();

					sizeObs?.disconnect();

					mountObs?.disconnect();

					if (panelFrame !== null && panelCol !== null) panelCol.remove();

					resizeHandle?.remove();

					[

						"__solExpTab",

						"__solExpToggleExpand",

						"__solExpSelectFile",

						"__solExpCollapseAll",

						"__solExpExpandAll",

						"__solExpRefresh",

						"__solExpSearch",

						"__solExpRefreshSCM", "__solExpCommitsScroll", "__solExpScmDividerDown", "__solExpSelectRepo", "__solExpCommitDetail", "__solExpCommitCheckout",

						"__solExpCommitMsg",

						"__solExpCommit",

						"__solExpStage",

						"__solExpUnstage",

						"__solExpDiscard",

						"__solExpStageAll",

						"__solExpUnstageAll",

						"__solExpDiscardAll",

						"__solExpToggleSection",

						"__solExpClearSearch",

						"__solExpDeleteFile",

						"__solExpContextMenu",

						"__solExpOpenFile",

						"__solExpSaveFile",

						"__solExpGetEditorState",

						"__solExpEditorListeners",

						"__solExpOpenDiff",

						"__solExpGetDiffState",

						"__solExpDiffListeners",

						"__solExpSelect",

						"__solExpCopy",

						"__solExpCut",

						"__solExpPaste",

						"__solExpDragStart",

						"__solExpDragOver",

						"__solExpDrop",

						"__solExpDropFiles",

						"__solExpDeletePaths",

						"__solExpPanelContextMenu",

						"__solExpClearSelection",

						"__solExpNew",

						"__solExpGitInit",

						"__solExpFetch",

						"__solExpPull",

						"__solExpPush",

						"__solExpSync",

						"__solExpRemotePanel",

						"__solExpRemoteName",

						"__solExpRemoteUrl",

						"__solExpRemoteAdd",

						"__solExpRemoteRemove",

						"__solExpRemoteSetUrl",

						"__solExpBranchPanel",

						"__solExpBranchName",

						"__solExpBranchFrom",

						"__solExpBranchCreate",

						"__solExpBranchCheckout",

						"__solExpBranchDelete",

						"__solExpBranchRename",

						"__solExpBranchMerge",

						"__solExpBranchPublish"

					].forEach((k) => delete window[k]);

					document.removeEventListener("click", hideContextMenu);

					document.removeEventListener("dragenter", dragGuard);

					document.removeEventListener("dragover", dragGuard);

					document.removeEventListener("drop", dragGuard);

				};

			}, "dsh-solution-explorer: wiring");

			ctx.effect(() => {

				const t = ctx.locale.bind(NS);

				ctx.slots.inject("conversation.view", () => ctx.slots.register({

					name: "conversation.view",

					id: "solution-explorer-editor",

					order: 20,

					locale: NS,

					label: () => t("panel.editor"),

					inject: (sessionId: SessionId) => ({ getRoot: () => {

						return ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd ?? "";

					} })

				}, EditorView));

				return () => {};

			}, "dsh-solution-explorer: editor view");

		}

		function EditorView(props) {

			const { sessionId, inject } = props;

			const [, forceUpdate] = useState(0);

			const rerender = useCallback(() => forceUpdate((n) => n + 1), []);

			const textareaRef = useRef(null);

			const gutterRef = useRef(null);

			const [dirty, setDirty] = useState(false);

			const diffRightRowRefs = useRef<(HTMLElement | null)[]>([]);

			const [diffRows, setDiffRows] = useState(null);

			const [diffDirty, setDiffDirty] = useState(false);

			const [diffSaving, setDiffSaving] = useState(false);

			const rowIdRef = useRef(0);

			const focusDiffRowRef = useRef(-1);

			const focusDiffOffsetRef = useRef(-1);

			const lastEditorFileRef = useRef(null);

			const hlPreRef = useRef(null);

			useEffect(() => {

				const idx = focusDiffRowRef.current;

				if (idx >= 0) {

					focusDiffRowRef.current = -1;

					const el = diffRightRowRefs.current[idx];

					const off = focusDiffOffsetRef.current;

					focusDiffOffsetRef.current = -1;

					if (el) {

						el.focus();

						if (typeof setCaretAt === "function" && off >= 0) setCaretAt(el, off);

					}

				}

			});

			useEffect(() => {

				const listeners = window.__solExpDiffListeners;

				if (listeners) {

					listeners.add(rerender);

					return () => {

						listeners.delete(rerender);

					};

				}

			}, [rerender]);

			useEffect(() => {

				const listeners = window.__solExpEditorListeners;

				if (listeners) {

					listeners.add(rerender);

					return () => {

						listeners.delete(rerender);

					};

				}

			}, [rerender]);

			useEffect(() => {

				const st = window.__solExpGetEditorState?.();

				if (st && textareaRef.current && st.editorContent !== null && st.editorLoading === false) {

					if (st.editorFile !== lastEditorFileRef.current) {

						lastEditorFileRef.current = st.editorFile;

						textareaRef.current.scrollTop = 0;

						if (gutterRef.current) gutterRef.current.scrollTop = 0;

					}

					if (textareaRef.current.value !== st.editorContent) {

						textareaRef.current.value = st.editorContent;

						setDirty(false);

					}

				}

			});

												const getDiffState = window.__solExpGetDiffState;

			const dstate = getDiffState ? getDiffState() : null;

			if (dstate && dstate.diffPath) {

				if (dstate.diffLoading) return h("div", { style: {

					padding: "16px",

					textAlign: "center",

					color: "var(--dsw-alias-label-tertiary)"

				} }, t("loading"));

				if (!diffRows || diffRows.path !== dstate.diffPath || diffRows.staged !== dstate.diffStaged) {

					const parsed = parseSideBySide(dstate.diffContent || "");

const oldLines = (dstate.diffOldContent || "").split("\n");

const newLines = (dstate.diffNewContent || "").split("\n");

if (oldLines[oldLines.length - 1] === "") oldLines.pop();

if (newLines[newLines.length - 1] === "") newLines.pop();

const oldToNew = new Map();

parsed.forEach((r) => {

if (r.old !== "" && r.oldNum !== null) oldToNew.set(r.oldNum, r.new !== "" && r.newNum !== null ? r.newNum : null);

});

const full = [];

let j = 1;

for (let i = 1; i <= oldLines.length; i++) {

const paired = oldToNew.has(i) ? oldToNew.get(i) : undefined;

if (paired === null) {

full.push({ id: rowIdRef.current++, old: oldLines[i - 1], new: "", oldNum: i, newNum: null, inNew: false, oldDel: true, newAdd: false });

} else if (paired !== undefined) {

while (j < paired) {

full.push({ id: rowIdRef.current++, old: "", new: newLines[j - 1], oldNum: null, newNum: j, inNew: true, oldDel: false, newAdd: true });

j++;

}

full.push({ id: rowIdRef.current++, old: oldLines[i - 1], new: newLines[paired - 1], oldNum: i, newNum: paired, inNew: true, oldDel: false, newAdd: false });

j = paired + 1;

} else {

full.push({ id: rowIdRef.current++, old: oldLines[i - 1], new: j <= newLines.length ? newLines[j - 1] : "", oldNum: i, newNum: j <= newLines.length ? j : null, inNew: j <= newLines.length, oldDel: false, newAdd: false });

j++;

}

}

while (j <= newLines.length) {

full.push({ id: rowIdRef.current++, old: "", new: newLines[j - 1], oldNum: null, newNum: j, inNew: true, oldDel: false, newAdd: true });

j++;

}

const diffLang = langFromPath(dstate.diffPath);

const oldRuns = diffLang ? (highlightLinesHtml(dstate.diffOldContent || "", diffLang) ?? undefined) : undefined;

setDiffRows({ path: dstate.diffPath, staged: dstate.diffStaged, rows: full, oldRuns });

setDiffDirty(false);

				}

				const rows = (diffRows && diffRows.path === dstate.diffPath && diffRows.staged === dstate.diffStaged) ? diffRows.rows : [];

				if (rows.length === 0) return h("div", { style: {

					padding: "16px",

					textAlign: "center",

					color: "var(--dsw-alias-label-tertiary)"

				} }, "无差异");

				const editable = !dstate.diffStaged;

				const NBSP = "\u00A0";

				const numStyle = {

					display: "inline-block",

					width: "3em",

					textAlign: "right",

					marginRight: "8px",

					color: "var(--dsw-alias-label-tertiary)",

					opacity: .6,

					userSelect: "none"

				};

				const rightHtml = (ri) => {

					const row = rows[ri];

					if (!row || row.new === "") return "";

					const l = langFromPath(dstate.diffPath);

					if (l) { const hl = highlightToHtml(row.new, l); if (hl) return hl; }

					return row.new.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

				};

				const onRightEnter = (e, i) => {

					e.preventDefault();

					const el = e.target;

					const text = el.textContent || "";

					let before = text, after = "";

					const caret = caretOffsetIn(el);

					before = text.slice(0, caret);

					after = text.slice(caret);

					setDiffRows((prev) => {

						if (!prev) return prev;

						const nr = [...prev.rows];

						nr[i] = { ...nr[i], new: before };

						nr.splice(i + 1, 0, { id: rowIdRef.current++, old: "", new: after, oldNum: null, newNum: null, inNew: true, oldDel: false, newAdd: true });

						return { ...prev, rows: nr };

					});

					focusDiffRowRef.current = i + 1;

					focusDiffOffsetRef.current = 0;

					setDiffDirty(true);

				};

				const saveNew = async () => {

					setDiffSaving(true);

					let content = "";

					let first = true;

					rows.forEach((r, i) => {

						if (r.inNew === false) return;

						const el = diffRightRowRefs.current[i];

						let text = r.new;

						if (el) {

							const html = el.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p)>/gi, "\n");

							const tmp = document.createElement("div");

							tmp.innerHTML = html;

							text = tmp.textContent ?? r.new;

						}

						content += (first ? "" : "\n") + text;

						first = false;

					});

					try {

						const result = await (await fetch("/solution-explorer/write", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root: dstate.diffRoot,

								path: dstate.diffPath,

								content

							})

						})).json();

						if (!result.ok) alert("保存失败: " + (result.error?.message || ""));

						else window.__solExpRefreshSCM?.();

					} catch (err) {

						alert("保存失败: " + (err.message || String(err)));

					}

					setDiffSaving(false);

					setDiffDirty(false);

				};

				return h("div", { style: {

					display: "flex",

					flexDirection: "column",

					height: "100%"

				} }, h("div", { style: {

					display: "flex",

					alignItems: "center",

					justifyContent: "space-between",

					padding: "6px 12px",

					borderBottom: "1px solid var(--dsw-alias-border-l1)",

					fontSize: "12px"

				} }, h("span", { style: { color: "var(--dsw-alias-label-secondary)" } }, dstate.diffPath + (dstate.diffStaged ? "（已暂存）" : "")), h("span", { style: {

					display: "flex",

					gap: "12px",

					alignItems: "center"

				} }, h("span", { style: { color: "#f14c4c" } }, document.documentElement.lang?.startsWith("zh") ? "变更前" : "Before"), h("span", { style: { color: "#4ec9b0" } }, document.documentElement.lang?.startsWith("zh") ? "变更后" : "After"), !editable ? h("span", { style: {

					color: "var(--dsw-alias-label-tertiary)",

					fontSize: "11px"

				} }, "已暂存只读") : diffSaving ? h("span", { style: {

					color: "var(--dsw-alias-label-secondary)",

					fontSize: "11px"

				} }, "保存中...") : diffDirty ? h("span", { style: {

					color: "#e2b714",

					fontSize: "11px"

				} }, "未保存的更改") : h("span", { style: {

					color: "#4ec9b0",

					fontSize: "11px"

				} }, "已保存"))), h("div", { style: {

					flex: 1,

					overflow: "auto",

					display: "flex",

					fontFamily: "monospace",

					fontSize: "12px",

					lineHeight: "18px"

				} }, h("div", { className: "sol-exp-hl", style: {

					flex: "1 1 50%",

					minWidth: 0,

					overflowX: "auto",

					borderRight: "1px solid var(--dsw-alias-border-l1)"

				} }, rows.map((r) => h("div", { key: "o" + r.id, style: {

					whiteSpace: "pre",

					padding: "0 8px",

					background: r.oldDel ? "rgba(241,76,76,0.15)" : "transparent",

					color: r.oldDel ? "#f14c4c" : "var(--dsw-alias-label-primary)"

				} }, h("span", { style: numStyle }, r.oldNum === null ? "" : String(r.oldNum)), r.old === "" ? h("span", null, NBSP) : (diffRows && diffRows.oldRuns && r.oldNum !== null ? h("span", { dangerouslySetInnerHTML: { __html: diffRows.oldRuns[r.oldNum - 1] ?? "" } }) : h("span", null, r.old))))), h("div", { className: "sol-exp-hl", style: {

					flex: "1 1 50%",

					minWidth: 0,

					overflowX: "auto"

				} }, rows.map((r, i) => h("div", { key: "n" + r.id, style: {

					whiteSpace: "pre",

					padding: "0 8px",

					background: r.newAdd ? "rgba(78,201,176,0.15)" : "transparent",

					color: r.newAdd ? "#4ec9b0" : "var(--dsw-alias-label-primary)"

				} }, h("span", { style: numStyle }, r.newNum === null ? "" : String(r.newNum)), r.inNew === false ? h("span", { style: {

					color: "var(--dsw-alias-label-tertiary)",

					opacity: .4

				} }, NBSP) : h("span", {

					contentEditable: editable,

					suppressContentEditableWarning: true,

					style: {

						flex: 1,

						userSelect: "text",

						WebkitUserSelect: "text",

						cursor: "text",

						outline: "none",

						minWidth: "2px"

					},

					spellCheck: false,

					onInput: () => setDiffDirty(true),

					ref: (el2) => { diffRightRowRefs.current[i] = el2; },

					onKeyDown: (e) => {

						if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveNew(); return }

						if (e.key === "Enter") onRightEnter(e, i)

						else if (e.key === "Backspace" || e.key === "Delete") {

							e.preventDefault()

							const sel = window.getSelection()

							if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {

								sel.getRangeAt(0).deleteContents()

								return

							}

							const el = e.target

							const text = el.textContent || ""

							const caret = caretOffsetIn(el)

							if (caret === 0 && e.key === "Backspace" && i > 0 && rows[i - 1].inNew !== false) {

								setDiffRows((prev) => {

									const nr = [...prev.rows]

									nr[i - 1] = { ...nr[i - 1], new: (nr[i - 1].new || "") + (nr[i].new || "") }

									nr.splice(i, 1)

									return { ...prev, rows: nr }

								})

								setDiffDirty(true)

								focusDiffRowRef.current = i - 1

								focusDiffOffsetRef.current = (rows[i - 1].new || "").length

								return

							}

							if (caret === text.length && e.key === "Delete" && i < rows.length - 1 && rows[i + 1].inNew !== false) {

								setDiffRows((prev) => {

									const nr = [...prev.rows]

									nr[i] = { ...nr[i], new: (nr[i].new || "") + (nr[i + 1].new || "") }

									nr.splice(i + 1, 1)

									return { ...prev, rows: nr }

								})

								setDiffDirty(true)

								focusDiffRowRef.current = i

								focusDiffOffsetRef.current = (rows[i].new || "").length

								return

							}

							document.execCommand(e.key === "Backspace" ? "delete" : "forwardDelete")

						}

					},

					onPaste: (e) => { e.preventDefault(); const text = e.clipboardData.getData("text/plain"); document.execCommand("insertText", false, text); }

				}, h("span", { dangerouslySetInnerHTML: { __html: rightHtml(i) } })))))));

			}

const getState = window.__solExpGetEditorState;

			const st = getState ? getState() : {

				editorFile: null,

				editorContent: null,

				editorLoading: false,

				editorError: null,

				editorSaving: false,

				editorUnsupported: false

			};

			const file = st.editorFile;

			const loading = st.editorLoading;

			const error = st.editorError;

			const saving = st.editorSaving;

			const unsupported = st.editorUnsupported;

			const statusText = saving ? t("editor.saving") : dirty ? t("editor.unsaved") : t("editor.saved");

			const statusColor = saving ? "var(--dsw-alias-label-secondary)" : dirty ? "#e2b714" : "#4ec9b0";

			const editorLang = langFromPath(file || "");

			let editorHtml = "";

			{

				const text = st.editorContent ?? "";

				if (editorLang) { const hl = highlightToHtml(text, editorLang); if (hl) editorHtml = hl; }

				if (!editorHtml) editorHtml = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

			}

			if (!file) return h("div", { style: {

				padding: "16px",

				textAlign: "center",

				color: "var(--dsw-alias-label-tertiary)"

			} }, t("editor.noFile"));

			if (loading) return h("div", { style: {

				padding: "16px",

				textAlign: "center",

				color: "var(--dsw-alias-label-tertiary)"

			} }, t("loading"));

			if (unsupported) return h("div", { style: {

				padding: "16px",

				textAlign: "center",

				color: "var(--dsw-alias-label-tertiary)"

			} }, document.documentElement.lang?.startsWith("zh") ? "不支持打开此文件" : "This file type is not supported");

			if (error) return h("div", { style: {

				padding: "16px",

				textAlign: "center",

				color: "var(--dsw-color-error)"

			} }, error);

			return h("div", { style: {

				display: "flex",

				flexDirection: "column",

				height: "100%"

			} }, h("div", { style: {

				display: "flex",

				alignItems: "center",

				justifyContent: "space-between",

				padding: "6px 8px",

				borderBottom: "1px solid var(--dsw-alias-border-l1)"

			} }, h("span", { style: {

				display: "flex",

				alignItems: "center",

				gap: "8px",

				fontSize: "12px"

			} }, h("span", { style: { color: "var(--dsw-alias-label-secondary)" } }, file)), h("span", { style: {

				color: statusColor,

				fontSize: "11px"

			} }, statusText)), h("div", { style: {

				flex: 1,

				minHeight: 0,

				display: "flex"

}}, h("div", {
ref: gutterRef,
style: {
width: "3em",
flex: "none",
overflow: "hidden",
background: "var(--dsw-alias-bg-input)",
borderRight: "1px solid var(--dsw-alias-border-l1)",
fontFamily: "monospace",
fontSize: "13px",
lineHeight: "1.5",
textAlign: "right",
padding: "8px 6px 8px 0",
color: "var(--dsw-alias-label-tertiary)",
opacity: .7,
userSelect: "none"
}
}, Array.from({ length: Math.max(1, (st.editorContent ?? "").split("\n").length) }, (_, i) => h("div", { key: i }, String(i + 1)))), h("div", { style: {
flex: 1,
minWidth: 0,
position: "relative"
} }, h("pre", {
ref: hlPreRef,
className: "sol-exp-hl",
style: {
position: "absolute",
top: 0,
left: 0,
right: 0,
bottom: 0,
margin: 0,
padding: "8px 12px",
fontFamily: "monospace",
fontSize: "13px",
lineHeight: "1.5",
whiteSpace: "pre-wrap",
overflow: "hidden",
pointerEvents: "none",
color: "var(--dsw-alias-label-primary)",
background: "transparent",
tabSize: 2
},
dangerouslySetInnerHTML: { __html: editorHtml }
}), h("textarea", {
ref: textareaRef,
style: {
position: "absolute",
top: 0,
left: 0,
right: 0,
bottom: 0,
width: "100%",
height: "100%",
padding: "8px 12px",
border: "none",
background: "transparent",
color: "transparent",
caretColor: "var(--dsw-alias-label-primary)",
fontFamily: "monospace",
fontSize: "13px",
lineHeight: "1.5",
outline: "none",
resize: "none",
tabSize: 2,
whiteSpace: "pre-wrap",
overflow: "auto"
},
defaultValue: st.editorContent ?? "",
onInput: (e) => {
_editorContent = e.target.value;
setDirty(true);
},
onScroll: (e) => {
const stp = e.target.scrollTop;
const slp = e.target.scrollLeft;
if (gutterRef.current) gutterRef.current.scrollTop = stp;
if (hlPreRef.current) { hlPreRef.current.scrollTop = stp; hlPreRef.current.scrollLeft = slp; }
},
onKeyDown: (e) => {
if ((e.ctrlKey || e.metaKey) && e.key === "s") {
e.preventDefault();
window.__solExpSaveFile?.();
setDirty(false);
}
},
spellCheck: false
}))), h("div", { style: {

				display: "flex",

				alignItems: "center",

				padding: "2px 8px",

				borderTop: "1px solid var(--dsw-alias-border-l1)",

				fontSize: "11px",

				color: "var(--dsw-alias-label-tertiary)"

			} }, h("span", null, t("editor.saveHint"))));

		}

export { apply }