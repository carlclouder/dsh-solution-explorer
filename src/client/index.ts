/**
 * dsh-solution-explorer — browser half: registers a dual-panel (Explorer + SCM)
 * component into the "details" slot of the web shell's three-column layout.
 * Features:
 * - File tree with git status indicators (M, A, D, ?, etc.)
 * - Source Control panel: staged/unstaged/untracked, stage/unstage/discard, commit
 * - File search
 * - File editor with save and Ctrl+S support
 * @module dsh-solution-explorer/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createElement as h, useState, useEffect, useCallback, useRef } from 'react'
import { NS, dictionaries, setLanguage, t, type SolutionExplorerKey } from './locales.ts'

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
    __solExpSelectFile?: (path: string) => void
    __solExpCollapseAll?: () => void
    __solExpExpandAll?: () => void
    __solExpRefresh?: () => void
    __solExpClearSearch?: () => void
    __solExpDeleteFile?: (target: string) => void
    __solExpContextMenu?: (target: string, x: number, y: number) => void
    __solExpSearch?: (query: string) => void
    __solExpRefreshSCM?: () => void
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
.sol-exp-chevron { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; color:var(--dsw-alias-label-tertiary,#6e6e6e); }
.sol-exp-file-icon { margin-right:4px; flex-shrink:0; font-size:14px; line-height:1; }
.sol-exp-file-name { overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.sol-exp-git-M { color:#e2b714; } .sol-exp-git-A { color:#4ec9b0; } .sol-exp-git-D { color:#f14c4c; }
.sol-exp-git-R { color:#4ec9b0; } .sol-exp-git-q { color:#6e6e6e; }
.sol-exp-scm-section { border-bottom:1px solid var(--dsw-alias-border-l1,#333); }
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
.sol-exp-scm-header-actions { display:flex; align-items:center; gap:2px; margin-left:auto; }
.sol-exp-hdr-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border:none; border-radius:6px; background:transparent; color:var(--dsw-alias-label-tertiary,#6e6e6e); cursor:pointer; padding:0; }
.sol-exp-hdr-btn:hover { background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.1)); color:var(--dsw-alias-label-primary,#d4d4d4); }
.sol-exp-hdr-btn.danger { color:var(--dsw-alias-state-error-primary,#f14c4c); }
.sol-exp-hdr-btn.danger:hover { background:var(--dsw-alias-state-error-primary,#f14c4c); color:#fff; }
.sol-exp-commit-box { padding:8px 12px; border-bottom:1px solid var(--dsw-alias-border-l1,#333); }
.sol-exp-commit-input { width:100%; box-sizing:border-box; padding:6px 10px; border:none; border-radius:8px; background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.06)); color:var(--dsw-alias-label-primary,#d4d4d4); font-size:13px; line-height:18px; outline:none; resize:none; font-family:inherit; min-height:60px; transition:background-color 120ms ease; }
.sol-exp-commit-input:focus { background:var(--dsw-alias-interactive-bg-hover-solid,var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,0.08))); }
.sol-exp-commit-input::placeholder { color:var(--dsw-alias-label-tertiary,#6e6e6e); }
.sol-exp-commit-row { display:flex; align-items:center; justify-content:center; gap:8px; margin-top:6px; }
.sol-exp-commit-btn { padding:4px 14px; border:none; border-radius:999px; background:var(--dsw-alias-button-info-fill,#3964fe); color:#fff; font-size:13px; font-weight:500; cursor:pointer; line-height:20px; transition:background-color 120ms ease; }
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
`;

export const inject = ['locale', 'sessions', 'slots']

// Module-level editor state (shared between EditorView and __solExpOpenFile)
let _editorFile: string | null = null
let _editorContent: string | null = null
let _editorLoading = false
let _editorError: string | null = null
let _editorSaving = false
let _editorUnsupported = false
const _editorListeners = new Set<() => void>()
let _editorRoot = ''

function _notifyEditorListeners() {
  for (const fn of _editorListeners) _editorListeners.has(fn) && fn()
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-solution-explorer: dictionaries')

  ctx.effect(() => {
    const styleId = 'dsh-solution-explorer-styles'
    if (document.getElementById(styleId)) return () => {}
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'dsh-solution-explorer: styles')

  ctx.effect(() => {
    let root = ''
    let currentTab: 'explorer' | 'search' | 'scm' = 'explorer'
    let treeState: any = null
    let loading = false
    let error: string | null = null
    let searchQuery = ''
    let searchResults: any[] = []
    let searching = false
    let expandedPaths = new Set<string>()
    let selectedPath: string | null = null
    let gitStatus: any = null
    let commitMessage = ''
    let committing = false
    let gitChangesCount = 0
    let activeEl: HTMLElement | null = null
    let loadSeq = 0

    function render() {
      if (!activeEl) return
      setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')
      activeEl.innerHTML = buildHTML()
    }
    async function loadTree() {
      if (!root) return
      const seq = ++loadSeq
      loading = true; error = null; render()
      try {
        const resp = await fetch(`/solution-explorer/tree?root=${encodeURIComponent(root)}`)
        const result = await resp.json()
        if (seq !== loadSeq || root === '') return
        if (result.ok) { treeState = result.value }
        else { error = result.error?.message || 'Failed to load tree' }
      } catch (err) {
        if (seq !== loadSeq) return
        error = err instanceof Error ? err.message : String(err)
      }
      loading = false; render()
    }
    async function loadGitStatus() {
      if (!root) return
      render()
      try {
        const resp = await fetch(`/solution-explorer/git-status?root=${encodeURIComponent(root)}`)
        const result = await resp.json()
        if (result.ok) {
          gitStatus = result.value
          gitChangesCount = (result.value.staged?.length || 0) + (result.value.unstaged?.length || 0) + (result.value.untracked?.length || 0)
        }
      } catch {}
      render()
      // Load recent commits if we have a valid repo
      if (gitStatus && gitStatus.branch !== 'unknown') {
        loadRecentCommits()
      }
    }
    // Load recent commits for the repository section
    async function loadRecentCommits() {
      if (!root || !gitStatus || gitStatus.branch === 'unknown') return
      try {
        const resp = await fetch(`/solution-explorer/git-log?root=${encodeURIComponent(root)}`)
        const result = await resp.json()
        if (result.ok && result.value) {
          const commitsList = document.getElementById('sol-exp-commits-list')
          if (commitsList) {
            if (result.value.length === 0) {
              commitsList.textContent = t('scm.log.empty')
            } else {
              commitsList.innerHTML = result.value.slice(0, 5).map((commit: any) => 
                `<div style="margin-bottom:4px;cursor:pointer" title="${commit.message}"><span style="color:var(--dsw-alias-label-primary)">${commit.shortHash}</span> ${commit.message.substring(0, 50)}${commit.message.length > 50 ? '...' : ''}</div>`
              ).join('')
            }
          }
        }
      } catch (err) {
        console.error('Failed to load commits:', err)
      }
    }

    async function doStage(files: string[]) {
      if (!root) return
      await fetch('/solution-explorer/git-stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, files }) })
      await loadGitStatus()
    }
    async function doUnstage(files: string[]) {
      if (!root) return
      await fetch('/solution-explorer/git-unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, files }) })
      await loadGitStatus()
    }
    async function doDiscard(files: string[]) {
      if (!root) return
      await fetch('/solution-explorer/git-discard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, files }) })
      await loadGitStatus(); await loadTree()
    }
    async function doCommit() {
      if (!root || !commitMessage.trim()) return
      committing = true; render()
      try {
        const resp = await fetch('/solution-explorer/git-commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, message: commitMessage.trim() }) })
        const result = await resp.json()
        if (result.ok) { commitMessage = ''; await loadGitStatus(); await loadTree() }
        else { alert(t('scm.commitFailed') + ': ' + (result.error?.message || '')) }
      } catch (err: any) { alert(t('scm.commitFailed') + ': ' + err.message) }
      committing = false; render()
    }
    async function searchFiles(query: string) {
      searchQuery = query
      if (!query.trim()) { searching = false; searchResults = []; render(); return }
      searching = true; render()
      try {
        const resp = await fetch(`/solution-explorer/search?root=${encodeURIComponent(root)}&q=${encodeURIComponent(query)}`)
        const result = await resp.json()
        if (searchQuery !== query) return
        if (result.ok) searchResults = result.value
        render()
      } catch { render() }
    }

    function buildHTML(): string {
      const activityBarHTML = `
        <div class="sol-exp-activity">
          <div class="sol-exp-activity-btn ${currentTab === 'explorer' ? 'active' : ''}" onclick="window.__solExpTab('explorer')" title="${t('panel.explorer')}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h5l1.5 1.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </div>
          <div class="sol-exp-activity-btn ${currentTab === 'search' ? 'active' : ''}" onclick="window.__solExpTab('search')" title="${t('file.search')}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M9.8 9.8L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </div>
          <div class="sol-exp-activity-btn ${currentTab === 'scm' ? 'active' : ''}" onclick="window.__solExpTab('scm')" title="${t('panel.scm')}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="3.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="12.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="11.5" cy="7" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 5v5.5M11.5 8.5c0 2.2-1.3 3-4.2 3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
            ${gitChangesCount > 0 ? `<span class="sol-exp-activity-badge">${gitChangesCount}</span>` : ''}
          </div>
          </div>
      `
      let contentHTML = ''
      if (currentTab === 'scm') contentHTML = buildSCMContent()
      else if (currentTab === 'search') contentHTML = buildSearchContent()
      else contentHTML = buildExplorerContent()
      return `
        <div class="sol-exp-panel">
          <div class="sol-exp-activity">${activityBarHTML}</div>
          <div class="sol-exp-body"><div class="sol-exp-main">${contentHTML}</div></div>
        </div>
      `
    }
    function buildSearchContent(): string {
      const searchPlaceholder = t('file.search')
      let contentHTML = ''
      if (searching) {
        if (searchResults.length === 0) { contentHTML = `<div class="sol-exp-empty">${document.documentElement.lang?.startsWith('zh') ? '无匹配文件' : 'No matching files'}</div>` }
        else {
          contentHTML = '<div class="sol-exp-search-results">' +
            searchResults.map((r: any) => `
              <div class="sol-exp-search-item ${selectedPath === r.path ? 'sol-exp-selected' : ''}"
                   onclick="window.__solExpSelectFile('${r.path.replace(/'/g, "\\'")}')">
                <span class="sol-exp-icon">${r.type === 'directory' ? '📁' : '📄'}</span>
                <span class="sol-exp-name">${escapeHtml(r.name)}</span>
                <span class="sol-exp-path">${escapeHtml(r.path)}</span>
              </div>
            `).join('') + '</div>'
        }
      } else { contentHTML = `<div class="sol-exp-empty">${document.documentElement.lang?.startsWith('zh') ? '输入关键词搜索文件' : 'Type to search files'}</div>` }
      return `
        <div class="sol-exp-header"><span class="sol-exp-title">${root ? root.split(/[\\\/]/).pop() || root : ''}</span></div>
        <div class="sol-exp-search">
          <svg class="sol-exp-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input type="text" class="sol-exp-search-input" placeholder="${searchPlaceholder}" value="${searchQuery}" oninput="window.__solExpSearch(this.value)" onkeydown="if(event.key==='Escape'){this.value='';window.__solExpSearch('')}"/>
        </div>
        <div class="sol-exp-content">${contentHTML}</div>
      `
    }
    function buildExplorerContent(): string {
      const emptyText = t('panel.empty')
      let contentHTML = ''
      if (loading) { contentHTML = `<div class="sol-exp-loading">${t('loading')}</div>` }
      else if (error) { contentHTML = `<div class="sol-exp-error">${error}</div>` }
      else if (searching) {
        if (searchResults.length === 0) { contentHTML = `<div class="sol-exp-empty">${document.documentElement.lang?.startsWith('zh') ? '无匹配文件' : 'No matching files'}</div>` }
        else {
          contentHTML = '<div class="sol-exp-search-results">' +
            searchResults.map((r: any) => `
              <div class="sol-exp-search-item ${selectedPath === r.path ? 'sol-exp-selected' : ''}"
                   onclick="window.__solExpSelectFile('${r.path.replace(/'/g, "\\'")}')">
                <span class="sol-exp-icon">${r.type === 'directory' ? '📁' : '📄'}</span>
                <span class="sol-exp-name">${escapeHtml(r.name)}</span>
                <span class="sol-exp-path">${escapeHtml(r.path)}</span>
              </div>
            `).join('') + '</div>'
        }
      } else if (treeState) { contentHTML = '<div class="sol-exp-tree">' + (treeState.children || []).map((c: any) => renderTreeNode(c, 0)).join('') + '</div>' }
      else { contentHTML = `<div class="sol-exp-empty">${emptyText}</div>` }
      return `
        <div class="sol-exp-header">
          <span class="sol-exp-title">${root ? root.split(/[\\\/]/).pop() || root : ''}</span>
          <div class="sol-exp-header-actions">
            <button class="sol-exp-toolbar-btn" onclick="window.__solExpExpandAll()" title="${t('tree.expand')}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h4v4H2V2zm0 8h4v4H2v-4zm8-8h4v4h-4V2zm0 8h4v4h-4v-4z"/></svg></button>
            <button class="sol-exp-toolbar-btn" onclick="window.__solExpCollapseAll()" title="${t('tree.collapse')}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v2H2V2zm0 5h12v2H2V7zm0 5h12v2H2v-2z"/></svg></button>
            <button class="sol-exp-toolbar-btn" onclick="window.__solExpRefresh()" title="${document.documentElement.lang?.startsWith('zh') ? '刷新' : 'Refresh'}"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a6 6 0 0 1 10.47-4.02L14 5.5V2h1v5h-5V6h2.33A4.5 4.5 0 0 0 3.5 8H2zm12 0a6 6 0 0 1-10.47 4.02L2 10.5V14H1V9h5v1H3.67A4.5 4.5 0 0 0 12.5 8H14z"/></svg></button>
          </div>
        </div>
        <div class="sol-exp-content">${contentHTML}</div>
      `
    }
    function buildSCMContent(): string {
      if (!root) { return `<div class="sol-exp-content"><div class="sol-exp-empty">${t('panel.empty')}</div></div>` }
      const status = gitStatus
      const isRepo = status && status.branch !== 'unknown'
      const staged = status?.staged || []
      const unstaged = status?.unstaged || []
      const untracked = status?.untracked || []
      const allChanges = [...unstaged, ...untracked]

      // Non-repo workspaces get a single hint instead of an empty commit box.
      if (!isRepo) { return `<div class="sol-exp-content"><div class="sol-exp-empty">${t('scm.notRepo')}</div></div>` }

      let sectionsHTML = ''

      // Commit box
      sectionsHTML += `
        <div class="sol-exp-commit-box">
          <textarea class="sol-exp-commit-input" placeholder="${t('scm.commit.placeholder')}${status?.branch && status.branch !== 'unknown' ? ' (' + status.branch + ')' : ''}" oninput="window.__solExpCommitMsg(this.value)">${escapeHtml(commitMessage)}</textarea>
          <div class="sol-exp-commit-row">
            <button class="sol-exp-commit-btn" onclick="window.__solExpCommit()" ${committing || !commitMessage.trim() ? 'disabled' : ''}>${committing ? t('scm.committing') : t('scm.commit.button')}</button>
          </div>
        </div>
      `

      // Changes section (unstaged + untracked)
      sectionsHTML += `
        <div class="sol-exp-scm-section">
          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('changes')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t('scm.changes')}<span class="sol-exp-scm-header-actions">
            <button class="sol-exp-hdr-btn" title="${t('scm.refresh')}" onclick="event.stopPropagation();window.__solExpRefreshSCM()"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a6 6 0 0 1 10.47-4.02L14 5.5V2h1v5h-5V6h2.33A4.5 4.5 0 0 0 3.5 8H2zm12 0a6 6 0 0 1-10.47 4.02L2 10.5V14H1V9h5v1H3.67A4.5 4.5 0 0 0 12.5 8H14z"/></svg></button>
            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn" title="${t('scm.stageAll')}" onclick="event.stopPropagation();window.__solExpStageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v12M2 8h12"/></svg></button>` : ''}
            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn danger" title="${t('scm.discardAll')}" onclick="event.stopPropagation();window.__solExpDiscardAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button>` : ''}
          </span><span class="sol-exp-scm-section-count">${allChanges.length}</span></div>
          ${allChanges.length === 0 ? `<div style="padding:4px 12px 8px 24px;font-size:12px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${t('scm.changes.none')}</div>` : ''}
          ${allChanges.map((item: any) => buildSCMItem(item, 'changes')).join('')}
        </div>
      `

      // Staged changes section (only if there are staged changes)
      if (staged.length > 0) {
        sectionsHTML += `
          <div class="sol-exp-scm-section">
            <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('staged')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t('scm.staged')}<span class="sol-exp-scm-header-actions">
              <button class="sol-exp-hdr-btn" title="${t('scm.unstageAll')}" onclick="event.stopPropagation();window.__solExpUnstageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V3M3.5 7.5L8 3l4.5 4.5"/></svg></button>
            </span><span class="sol-exp-scm-section-count">${staged.length}</span></div>
            ${staged.map((item: any) => buildSCMItem(item, 'staged')).join('')}
          </div>
        `
      }

      // Repository section (branch + recent commits): secondary info at the bottom.
      sectionsHTML += `
        <div class="sol-exp-scm-section">
          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('repository')"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg)"><path d="M6 4l4 4-4 4"/></svg>${t('scm.repository')}</div>
          <div style="padding:4px 12px 8px 24px">
            <div style="font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:4px">${t('scm.repository.branch')}: <span style="color:var(--dsw-alias-label-primary)">${status?.branch || ''}</span></div>
            <div style="font-size:12px;color:var(--dsw-alias-label-secondary)">${t('scm.repository.commits')}</div>
            <div id="sol-exp-commits-list" style="margin-top:4px;font-size:12px;color:var(--dsw-alias-label-tertiary)">Loading...</div>
          </div>
        </div>
      `

      return `<div class="sol-exp-content">${sectionsHTML}</div>`
    }
    function buildSCMItem(item: any, section: 'staged' | 'changes'): string {
      const statusChar = item.status
      const action = section === 'staged'
        ? `<button class="sol-exp-scm-action-btn" onclick="window.__solExpUnstage(['${item.path.replace(/'/g, "\\'")}'])" title="${t('scm.unstage')}">◦</button>`
        : `<button class="sol-exp-scm-action-btn" onclick="window.__solExpStage(['${item.path.replace(/'/g, "\\'")}'])" title="${t('scm.stage')}">+</button>
           <button class="sol-exp-scm-action-btn" onclick="window.__solExpDiscard(['${item.path.replace(/'/g, "\\'")}'])" title="${t('scm.discard')}">✕</button>`
      return `
        <div class="sol-exp-scm-item">
          <span class="sol-exp-scm-status sol-exp-git-${statusChar === '?' ? '\\?' : statusChar}">${statusChar}</span>
          <span class="sol-exp-scm-path">${escapeHtml(item.path)}</span>
          <span class="sol-exp-scm-actions">${action}</span>
        </div>
      `
    }
    function renderTreeNode(node: any, depth: number): string {
      if (!node) return ''
      const isDir = node.type === 'directory'
      const isExpanded = expandedPaths.has(node.path)
      const isSelected = selectedPath === node.path
      const hasChildren = isDir && node.children && node.children.length > 0
      const padding = 12 + depth * 16
      const chevron = isDir
        ? (hasChildren ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="transform:${isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};transition:transform .15s ease"><path d="M6 4l4 4-4 4"/></svg>` : '<span style="width:16px;display:inline-block"></span>')
        : '<span style="width:16px;display:inline-block"></span>'
      const icon = isDir ? (isExpanded ? '📂' : '📁') : '📄'
      const clickHandler = isDir
        ? `window.__solExpToggleExpand('${node.path.replace(/'/g, "\\'").replace(/\\/g, "\\\\")}')`
        : `window.__solExpSelectFile('${node.path.replace(/'/g, "\\'").replace(/\\/g, "\\\\")}')`
      const childrenHTML = isDir && isExpanded && hasChildren ? `<div class="sol-exp-tree-children">${node.children.map((c: any) => renderTreeNode(c, depth + 1)).join('')}</div>` : ''
      return `
        <div class="sol-exp-tree-node-wrapper">
          <div class="sol-exp-tree-node ${isSelected ? 'sol-exp-selected' : ''}"
               style="padding-left:${padding}px"
               onclick="${clickHandler}"
               data-sol-exp-path="${escapeHtml(node.path)}"
               oncontextmenu="event.preventDefault();window.__solExpContextMenu(this.dataset.solExpPath||'', event.pageX, event.pageY)">
            <span class="sol-exp-chevron">${chevron}</span>
            <span class="sol-exp-file-icon">${icon}</span>
            <span class="sol-exp-file-name">${escapeHtml(node.name)}</span>
            ${node.gitStatus ? `<span class="sol-exp-git-letter sol-exp-git-${node.gitStatus === '?' ? 'q' : node.gitStatus}">${node.gitStatus}</span>` : ''}
          </div>
          ${childrenHTML}
        </div>
      `
    }
    function escapeHtml(str: string): string {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\\\\/g, '\\92;')
    }

    let searchTimer: any
    window.__solExpTab = (tab: string) => { currentTab = tab as any; render(); if (tab === 'scm') loadGitStatus() }
    window.__solExpToggleExpand = (path: string) => { if (expandedPaths.has(path)) expandedPaths.delete(path); else expandedPaths.add(path); render() }
    window.__solExpSelectFile = async (path: string) => {
      selectedPath = path
      console.log('[sol-exp] selectFile:', path, 'hasOpenFile:', typeof window.__solExpOpenFile === 'function')
      if (typeof window.__solExpOpenFile === 'function') {
        window.__solExpOpenFile(path)
      } else {
        console.log('[sol-exp] __solExpOpenFile not available yet')
      }
    }
    window.__solExpCollapseAll = () => { expandedPaths = new Set(); render() }
    window.__solExpExpandAll = () => {
      const paths = new Set<string>()
      const collect = (n: any) => { if (n?.type === 'directory') { paths.add(n.path); for (const c of (n.children || [])) collect(c) } }
      if (treeState) collect(treeState); expandedPaths = paths; render()
    }
    window.__solExpRefresh = () => { loadTree(); loadGitStatus() }
    window.__solExpClearSearch = () => { searchQuery = ''; searching = false; searchResults = []; render() }
    window.__solExpSearch = (query: string) => { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => searchFiles(query), 300) }
    window.__solExpRefreshSCM = () => { loadGitStatus() }
    window.__solExpCommitMsg = (msg: string) => { commitMessage = msg; render() }
    window.__solExpCommit = () => { doCommit() }
    window.__solExpStage = (files: string[]) => { doStage(files) }
    window.__solExpUnstage = (files: string[]) => { doUnstage(files) }
    window.__solExpDiscard = (files: string[]) => { doDiscard(files) }
    window.__solExpStageAll = () => { const all = [...(gitStatus?.unstaged || []), ...(gitStatus?.untracked || [])].map((i: any) => i.path); if (all.length) doStage(all) }
    window.__solExpUnstageAll = () => { const all = (gitStatus?.staged || []).map((i: any) => i.path); if (all.length) doUnstage(all) }
    window.__solExpDiscardAll = () => {
      const all = [...(gitStatus?.unstaged || []), ...(gitStatus?.untracked || [])].map((i: any) => i.path)
      if (all.length && window.confirm(t('scm.discardAllConfirm'))) doDiscard(all)
    }
        let contextMenuEl: HTMLElement | null = null
    function hideContextMenu() { if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; } }
    document.addEventListener('click', hideContextMenu)
    window.__solExpContextMenu = (target: string, x: number, y: number) => {
      hideContextMenu()
      const menu = document.createElement('div'); menu.className = 'sol-exp-context-menu'
      menu.style.left = Math.min(x, window.innerWidth - 160) + 'px'; menu.style.top = Math.min(y, window.innerHeight - 80) + 'px'
      menu.addEventListener('click', (e) => e.stopPropagation()); menu.addEventListener('contextmenu', (e) => e.preventDefault())
      const deleteItem = document.createElement('div'); deleteItem.className = 'sol-exp-context-menu-item danger'; deleteItem.textContent = '删除'
      deleteItem.addEventListener('click', () => { hideContextMenu(); window.__solExpDeleteFile!(target) }); menu.appendChild(deleteItem)
      const copyRelItem = document.createElement('div'); copyRelItem.className = 'sol-exp-context-menu-item'; copyRelItem.textContent = '复制相对路径'
      copyRelItem.addEventListener('click', () => { hideContextMenu(); navigator.clipboard.writeText(target) }); menu.appendChild(copyRelItem)
      const copyAbsItem = document.createElement('div'); copyAbsItem.className = 'sol-exp-context-menu-item'; copyAbsItem.textContent = '复制绝对路径'
      copyAbsItem.addEventListener('click', () => { hideContextMenu(); const sep = root.endsWith('/') || root.endsWith('\\') ? '' : '/'; navigator.clipboard.writeText(root + sep + target) }); menu.appendChild(copyAbsItem)
      document.body.appendChild(menu); contextMenuEl = menu
    }
    window.__solExpDeleteFile = async (target: string) => {
      if (!root || !target) return
      if (!window.confirm('确定删除：' + target + '?')) return
      try {
        const resp = await fetch('/solution-explorer/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, path: target }) })
        const result = await resp.json()
        if (result.ok) { if (selectedPath === target) selectedPath = null; await loadTree(); await loadGitStatus() }
        else { alert(t('error.read') + ': ' + (result.error?.message || '')) }
      } catch (err: any) { alert(t('error.read') + ': ' + (err.message || String(err))) }
    }
    window.__solExpToggleSection = (id: string) => { const el = document.querySelector(`[data-section="${id}"]`); if (el) el.classList.toggle('collapsed') }

    const PANEL_WIDTH = 280; const PANEL_MIN = 264; const PANEL_MAX = 420
    let panelWidth = 0; let panelFrame: HTMLElement | null = null; let panelCol: HTMLDivElement | null = null
    let shellTracks: string[] = []; let styleObs: MutationObserver | null = null
    let sizeObs: ResizeObserver | null = null; let resizeHandle: HTMLDivElement | null = null
    function parseGridTracks(input: string): string[] {
      const tracks: string[] = []; let depth = 0; let current = ''
      for (const char of input) {
        if (char === '(') depth++; if (char === ')') depth = Math.max(0, depth - 1)
        if (char === ' ' && depth === 0) { if (current !== '') { tracks.push(current); current = '' }; continue }
        current += char
      }
      if (current !== '') tracks.push(current); return tracks
    }
    function trackPx(track: string): number { const m = /^(-?[\\d.]+)px$/.exec(track.trim()); return m === null ? 0 : Number(m[1]) }
    function clampPanelWidth(px: number): number { return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(px))) }
    function findFrame(): HTMLElement | null {
      const s = document.querySelector<HTMLElement>('[data-dsh-frame]')
      if (s !== null) return s; return document.querySelector<HTMLElement>('[class*="sidebarCol"]')?.parentElement ?? null
    }
    function applyGrid(): void {
      if (panelFrame === null || shellTracks.length !== 3) return
      panelFrame.style.gridTemplateColumns = `${shellTracks[0]} minmax(0, 1fr) ${shellTracks[2]} ${Math.round(panelWidth)}px`
      if (panelCol !== null) panelCol.style.visibility = panelWidth > 0 ? 'visible' : 'hidden'
      if (resizeHandle !== null) { const w = panelFrame.getBoundingClientRect().width; resizeHandle.style.left = (w - panelWidth - 3) + 'px' }
    }
    function mountColumn(): void {
      if (panelFrame !== null) return
      const frame = findFrame(); if (frame === null) return
      panelFrame = frame; panelCol = document.createElement('div')
      panelCol.dataset.solutionExplorer = ''; panelCol.style.minWidth = '0'; panelCol.style.overflow = 'hidden'
      panelCol.style.display = 'flex'; panelCol.style.flexDirection = 'column'
      panelCol.style.borderLeft = '1px solid var(--dsw-alias-border-l2, #333)'
      frame.appendChild(panelCol); activeEl = panelCol; render()
      resizeHandle = document.createElement('div'); resizeHandle.className = 'sol-exp-resize-handle'
      resizeHandle.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault(); resizeHandle!.dataset.dragging = 'true'; resizeHandle!.setPointerCapture(e.pointerId)
        const startX = e.clientX; const startWidth = panelWidth
        const onMove = (me: PointerEvent) => { const dx = me.clientX - startX; panelWidth = clampPanelWidth(startWidth - dx); applyGrid() }
        const onUp = () => { resizeHandle!.removeEventListener('pointermove', onMove); resizeHandle!.removeEventListener('pointerup', onUp); resizeHandle!.dataset.dragging = undefined }
        resizeHandle!.addEventListener('pointermove', onMove); resizeHandle!.addEventListener('pointerup', onUp)
      })
      frame.appendChild(resizeHandle); applyGrid()
      const syncGrid = (): void => {
        if (panelFrame === null) return; const inline = panelFrame.style.gridTemplateColumns; if (inline === '') return
        const tracks = parseGridTracks(inline)
        if (tracks.length >= 2 && tracks.length <= 3) { shellTracks = tracks; applyGrid(); return }
        if (tracks.length === 4 && shellTracks.length === 3) return
      }
      styleObs = new MutationObserver(syncGrid); styleObs.observe(frame, { attributes: true, attributeFilter: ['style'] })
      sizeObs = new ResizeObserver(() => { applyGrid() }); sizeObs.observe(frame)
      const initial = frame.style.gridTemplateColumns
      if (initial !== '') { const tracks = parseGridTracks(initial); if (tracks.length >= 2 && tracks.length <= 3) shellTracks = tracks; else if (tracks.length === 4 && trackPx(tracks[0]) > 0) shellTracks = tracks.slice(0, 3) }
      applyGrid()
    }
    let mountObs: MutationObserver | null = null
    function waitForFrame(): void {
      mountColumn(); if (panelFrame !== null) return
      mountObs = new MutationObserver(() => { mountColumn(); if (panelFrame !== null) mountObs?.disconnect() })
      mountObs.observe(document.body, { childList: true, subtree: true })
    }
    function handleSessionChange() {
      const snapshot = ctx.sessions.list.getSnapshot()
      const sessionId = snapshot.current as SessionId | undefined
      const cwd = sessionId === undefined ? undefined : snapshot.byId[sessionId]?.cwd
      const newRoot = typeof cwd === 'string' && cwd !== '' ? cwd : ''
      panelWidth = newRoot !== '' ? PANEL_WIDTH : 0
      if (newRoot !== '' && root === '') applyGrid()
      if (newRoot === root) return
      root = newRoot; treeState = null; gitStatus = null; gitChangesCount = 0; loading = root !== ''; render()
      if (root) { loadTree(); loadGitStatus() }
    }
    const unsub = ctx.sessions.list.subscribe(handleSessionChange)
    handleSessionChange(); waitForFrame()

    // Inject global editor functions
    console.log('[sol-exp] injecting __solExpOpenFile')
    ;(window as any).__solExpOpenFile = async (path: string) => {
      console.log('[sol-exp] openFile called:', path)
      _editorFile = path
      _editorContent = null
      _editorLoading = true
      _editorError = null
      _editorUnsupported = false
      _notifyEditorListeners()
      try {
        const resp = await fetch('/solution-explorer/read?root=' + encodeURIComponent(root) + '&file=' + encodeURIComponent(path))
        const result = await resp.json()
        if (result.ok) {
          if (result.value.supported === false) {
            _editorUnsupported = true
            _editorContent = null
          } else {
            _editorContent = result.value.content
          }
        } else {
          _editorError = result.error?.message || 'Failed to read file'
        }
      } catch (err: any) {
        _editorError = err.message || String(err)
      }
      _editorLoading = false
      _notifyEditorListeners()
      // Auto-switch to the editor tab
      setTimeout(() => {
        const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === (document.documentElement.lang?.startsWith('zh') ? '编辑' : 'Edit')) as HTMLElement | null
        if (tab) tab.click()
      }, 50)
    }
    ;(window as any).__solExpSaveFile = async () => {
      if (!_editorFile || _editorContent === null) return
      _editorSaving = true
      _notifyEditorListeners()
      try {
        const resp = await fetch('/solution-explorer/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ root, path: _editorFile, content: _editorContent }),
        })
        const result = await resp.json()
        if (!result.ok) alert('Save failed: ' + (result.error?.message || ''))
      } catch (err: any) {
        alert('Save failed: ' + (err.message || String(err)))
      }
      _editorSaving = false
      _notifyEditorListeners()
    }
    ;(window as any).__solExpGetEditorState = () => ({
      editorFile: _editorFile,
      editorContent: _editorContent,
      editorLoading: _editorLoading,
      editorError: _editorError,
      editorSaving: _editorSaving,
      editorUnsupported: _editorUnsupported,
    })
    ;(window as any).__solExpEditorListeners = _editorListeners

    return () => {
      unsub(); styleObs?.disconnect(); sizeObs?.disconnect(); mountObs?.disconnect()
      if (panelFrame !== null && panelCol !== null) panelCol.remove()
      const keys = ['__solExpTab', '__solExpToggleExpand', '__solExpSelectFile', '__solExpCollapseAll',
        '__solExpExpandAll', '__solExpRefresh', '__solExpSearch', '__solExpRefreshSCM',
        '__solExpCommitMsg', '__solExpCommit', '__solExpStage', '__solExpUnstage',
        '__solExpDiscard', '__solExpStageAll', '__solExpUnstageAll', '__solExpDiscardAll',
        '__solExpToggleSection', '__solExpClearSearch', '__solExpDeleteFile', '__solExpContextMenu',
        '__solExpOpenFile', '__solExpSaveFile', '__solExpGetEditorState', '__solExpEditorListeners']
      keys.forEach(k => delete (window as any)[k])
      hideContextMenu(); document.removeEventListener('click', hideContextMenu)
    }
  }, 'dsh-solution-explorer: wiring')

  // Register an editor view tab in the conversation view slot (after trajectory at order: 10)
  ctx.effect(() => {
    const t = ctx.locale.bind(NS)
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
      name: 'conversation.view',
      id: 'solution-explorer-editor',
      order: 20,
      locale: NS,
      label: () => t('panel.editor'),
      inject: (sessionId: SessionId) => ({
        getRoot: () => {
          const snapshot = ctx.sessions.list.getSnapshot()
          const session = snapshot.byId[sessionId]
          return session?.cwd ?? ''
        },
      }),
    }, EditorView))
    return () => {}
  }, 'dsh-solution-explorer: editor view')
}

// EditorView component for the conversation.view slot
function EditorView(props: any) {
  const { sessionId, inject } = props
  const [, forceUpdate] = useState(0)
  const rerender = useCallback(() => forceUpdate(n => n + 1), [])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const listeners = (window as any).__solExpEditorListeners as Set<() => void> | undefined
    if (listeners) {
      listeners.add(rerender)
      return () => { listeners.delete(rerender) }
    }
  }, [rerender])

  // When a new file is loaded, update the textarea content and reset dirty
  useEffect(() => {
    const st = ((window as any).__solExpGetEditorState as (() => any) | undefined)?.()
    if (st && textareaRef.current && st.editorContent !== null && st.editorLoading === false) {
      if (textareaRef.current.value !== st.editorContent) {
        textareaRef.current.value = st.editorContent
        setDirty(false)
      }
    }
  })

  const getState = (window as any).__solExpGetEditorState as (() => {
    editorFile: string | null; editorContent: string | null
    editorLoading: boolean; editorError: string | null; editorSaving: boolean; editorUnsupported: boolean
  }) | undefined

  const st = getState ? getState() : { editorFile: null, editorContent: null, editorLoading: false, editorError: null, editorSaving: false, editorUnsupported: false }

  const file = st.editorFile
  const loading = st.editorLoading
  const error = st.editorError
  const saving = st.editorSaving
  const unsupported = st.editorUnsupported

  const statusText = saving ? t('editor.saving') : (dirty ? t('editor.unsaved') : t('editor.saved'))
  const statusColor = saving ? 'var(--dsw-alias-label-secondary)' : (dirty ? '#e2b714' : '#4ec9b0')

  if (!file) {
    return h('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' } },
      t('editor.noFile')
    )
  }

  if (loading) {
    return h('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' } },
      t('loading')
    )
  }

  if (unsupported) {
    return h('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' } },
      document.documentElement.lang?.startsWith('zh') ? '不支持打开此文件' : 'This file type is not supported'
    )
  }

  if (error) {
    return h('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--dsw-color-error)' } },
      error
    )
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
      h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
        h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, file),
        h('span', { style: { color: statusColor, fontSize: '11px' } }, statusText)
      ),
      h('button', {
        style: { padding: '2px 8px', border: 'none', borderRadius: '4px', background: 'var(--dsw-alias-bg-modifier)', color: '#fff', cursor: 'pointer', fontSize: '12px' },
        onClick: () => { (window as any).__solExpSaveFile?.(); setDirty(false) },
        disabled: saving || !dirty,
      }, saving ? t('editor.saving') : t('editor.save'))
    ),
    h('textarea', {
      ref: textareaRef,
      style: { flex: 1, width: '100%', padding: '8px 12px', border: 'none', background: 'var(--dsw-alias-bg-input)', color: 'var(--dsw-alias-label-primary)', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', outline: 'none', resize: 'none', tabSize: 2 },
      defaultValue: st.editorContent ?? '',
      onInput: (e: any) => { _editorContent = e.target.value; setDirty(true) },
      onKeyDown: (e: any) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          ;(window as any).__solExpSaveFile?.()
          setDirty(false)
        }
      },
      spellCheck: false,
    }),
    h('div', { style: { display: 'flex', alignItems: 'center', padding: '2px 8px', borderTop: '1px solid var(--dsw-alias-border-l1)', fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' } },
      h('span', null, t('editor.saveHint'))
    )
  )
}
