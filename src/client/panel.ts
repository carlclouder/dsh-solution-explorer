import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"

import { Terminal } from "@xterm/xterm"

import { FitAddon } from "@xterm/addon-fit"

import { STYLES } from "./styles.ts"

import { XTERM_CSS } from "./xterm-css.ts"

import { setLanguage, t } from "./locales.ts"

import { editorStore, notifyEditorListeners } from "./state/editor-store.ts"

import { diffStore, notifyDiffListeners } from "./state/diff-store.ts"

import { escapeHtml, relTime } from "./shared/dom.ts"

import { showToast, showConfirm, showPrompt } from "./shared/ui.ts"

import { folderIcon, fileIcon, isImageFile, gitStatusClass } from "./explorer/icons.ts"

import { createInitialState } from "./state/store.ts"

import { buildExplorerContent, loadTree, refreshTreeSilent, registerTreeBridges } from "./explorer/tree-render.ts"

import { buildSearchContent, searchFiles, registerSearchBridges } from "./explorer/search.ts"

import { registerClipboardBridges } from "./explorer/clipboard.ts"

import { registerContextMenuBridges } from "./explorer/context-menu.ts"

import { buildSCMTopHTML, buildSCMContent } from "./scm/scm-view.ts"

import { resetGraph, commitsListHTML, renderGraphRow } from "./scm/graph.ts"

import { getCommitDetail, ensureCommitDetailInline, reapplyCommitDetailInline, hideCommitTooltip, scheduleHideCommitTooltip, cancelHideCommitTooltip, showCommitTooltip, loadRecentCommits, loadCommitsPage } from "./scm/history.ts"

import { loadGitStatus, loadRepos, doStage, doUnstage, doDiscard, doCommit } from "./scm/actions.ts"

import { loadRemotes, loadBranches, loadTags } from "./scm/branches.ts"

import { registerScmBridges } from "./scm/bridges.ts"

export function mountPanel(ctx: ClientContext): void {
			ctx.effect(() => {

				const state = createInitialState();

				let root = "";

				let currentTab = "explorer";







				// Persisted collapsed state of SCM sections. Kept in state (not
				// only as a DOM class) so any render() / silent refresh rebuilds
				// the section with the class — otherwise the repository section
				// (and the top-half sections after a status refresh) silently
				// re-expand and the collapse button looks broken.








				const gitRoot = () => state.scm.activeRepo || root;


				// Cached innerHTML of the recent-commits list: null = not loaded
				// yet (render shows the loading placeholder), "" = loaded but
				// empty. render() rebuilds the list from this cache, so a render
				// landing after the git-log response can never wipe a filled
				// list back to the placeholder (e.g. tree/repos loads finishing
				// late after a conversation switch).
				// Generation counter: bumped on every reload/switch so a git-log
				// fetch still in flight for the previous repo/branch is discarded
				// instead of writing stale commits into the current list.
				// Commit-detail cache (hash -> detail) shared by the inline
				// expansion and the hover tooltip; cleared on session change.
				// Hover tooltip state for commit rows (custom tooltip replaces
				// the native title attribute).
				// Remotes fetch guard for the "open on GitHub" tooltip link.


				let activeEl = null;

				let loadSeq = 0;

				function render() {

					// During a divider drag the SCM DOM must stay untouched: any
					// rebuild here would reset flex-basis from the dragged pixel
					// value back to the percentage default and make the divider
					// jump (visible on the first drag after startup).
					if (state.scm.scmDragging) return;

					if (!activeEl) return;

					setLanguage(document.documentElement.lang?.startsWith("zh") ? "zh" : "en");

					// Folded: render only the compact rail — the expand control
					// plus the three feature icons — instead of the activity
					// bar + body. The shell column keeps its border, so the
					// rail reads as a sibling of the native collapsed sidebar.
					if (panelCollapsed) {

						// Rail expand control mirrors the native sidebar rail: a
						// 16px panel-left glyph (same Figma source the shell
						// swaps in on rail hover), so the folded panel reads as
						// a sibling of the native collapsed rail.
						activeEl.innerHTML = `<div class="sol-exp-panel sol-exp-panel-rail"><button class="sol-exp-rail-btn" title="${document.documentElement.lang?.startsWith("zh") ? "展开面板" : "Expand panel"}" onclick="window.__solExpTogglePanel()"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z"/></svg></button><button class="sol-exp-rail-icon" title="${t("panel.explorer")}" onclick="window.__solExpRailOpen('explorer')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h5l1.5 1.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button><button class="sol-exp-rail-icon" title="${t("file.search")}" onclick="window.__solExpRailOpen('search')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M9.8 9.8L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><button class="sol-exp-rail-icon" title="${t("panel.scm")}" onclick="window.__solExpRailOpen('scm')"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M6 5C6 4.44772 6.44772 4 7 4C7.55228 4 8 4.44772 8 5C8 5.55228 7.55228 6 7 6C6.44772 6 6 5.55228 6 5ZM8 7.82929C9.16519 7.41746 10 6.30622 10 5C10 3.34315 8.65685 2 7 2C5.34315 2 4 3.34315 4 5C4 6.30622 4.83481 7.41746 6 7.82929V16.1707C4.83481 16.5825 4 17.6938 4 19C4 20.6569 5.34315 22 7 22C8.65685 22 10 20.6569 10 19C10 17.7334 9.21506 16.6501 8.10508 16.2101C8.45179 14.9365 9.61653 14 11 14H13C16.3137 14 19 11.3137 19 8V7.82929C20.1652 7.41746 21 6.30622 21 5C21 3.34315 19.6569 2 18 2C16.3431 2 15 3.34315 15 5C15 6.30622 15.8348 7.41746 17 7.82929V8C17 10.2091 15.2091 12 13 12H11C9.87439 12 8.83566 12.3719 8 12.9996V7.82929ZM18 6C18.5523 6 19 5.55228 19 5C19 4.44772 18.5523 4 18 4C17.4477 4 17 4.44772 17 5C17 5.55228 17.4477 6 18 6ZM6 19C6 18.4477 6.44772 18 7 18C7.55228 18 8 18.4477 8 19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19Z" fill="currentColor"/></svg>${state.scm.gitChangesCount > 0 ? `<span class="sol-exp-activity-badge">${state.scm.gitChangesCount}</span>` : ""}</button><button class="sol-exp-rail-icon sol-exp-terminal-toggle${terminalOpen ? " active" : ""}" title="${document.documentElement.lang?.startsWith("zh") ? "终端" : "Terminal"}" onclick="window.__solExpToggleTerminal()"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 5.5l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 10.5h2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>`;

						return;

					}

					activeEl.innerHTML = buildHTML();
					hideCommitTooltip(historyDeps);
					reapplyCommitDetailInline(historyDeps);

				}

				

				// Silent auto-refresh: pull a new tree and reconcile it into the
				// existing DOM (no loading state, no flash); failures keep the
				// current tree untouched.
				

				

				
				


				

				

				

				

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

            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M6 5C6 4.44772 6.44772 4 7 4C7.55228 4 8 4.44772 8 5C8 5.55228 7.55228 6 7 6C6.44772 6 6 5.55228 6 5ZM8 7.82929C9.16519 7.41746 10 6.30622 10 5C10 3.34315 8.65685 2 7 2C5.34315 2 4 3.34315 4 5C4 6.30622 4.83481 7.41746 6 7.82929V16.1707C4.83481 16.5825 4 17.6938 4 19C4 20.6569 5.34315 22 7 22C8.65685 22 10 20.6569 10 19C10 17.7334 9.21506 16.6501 8.10508 16.2101C8.45179 14.9365 9.61653 14 11 14H13C16.3137 14 19 11.3137 19 8V7.82929C20.1652 7.41746 21 6.30622 21 5C21 3.34315 19.6569 2 18 2C16.3431 2 15 3.34315 15 5C15 6.30622 15.8348 7.41746 17 7.82929V8C17 10.2091 15.2091 12 13 12H11C9.87439 12 8.83566 12.3719 8 12.9996V7.82929ZM18 6C18.5523 6 19 5.55228 19 5C19 4.44772 18.5523 4 18 4C17.4477 4 17 4.44772 17 5C17 5.55228 17.4477 6 18 6ZM6 19C6 18.4477 6.44772 18 7 18C7.55228 18 8 18.4477 8 19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19Z" fill="currentColor"/></svg>

            ${state.scm.gitChangesCount > 0 ? `<span class="sol-exp-activity-badge">${state.scm.gitChangesCount}</span>` : ""}

          </div>

          <div class="sol-exp-activity-btn ${terminalOpen ? "active" : ""}" onclick="window.__solExpToggleTerminal()" title="${t("panel.terminal")}">

            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.5l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 10.5h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>

          </div>

          <div style="flex:1"></div>

          <div class="sol-exp-activity-btn" onclick="window.__solExpTogglePanel()" title="${document.documentElement.lang?.startsWith("zh") ? "收起面板" : "Collapse panel"}">

            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z"/></svg>

          </div>

          </div>

      `;

					let contentHTML = "";

					if (currentTab === "scm") contentHTML = '<div class="sol-exp-scm-host" data-sol-exp-scm-host>' + buildSCMContent(state.scm, state.commits, root) + '</div>';

					else if (currentTab === "search") contentHTML = buildSearchContent(state.search, state.tree, root);

					else contentHTML = buildExplorerContent(state.tree, state.clipboard, root);

					return `

        <div class="sol-exp-panel" ondragover="event.preventDefault()" ondrop="event.preventDefault();window.__solExpDrop('', event)" oncontextmenu="window.__solExpPanelContextMenu(event)">

          ${activityBarHTML}

          <div class="sol-exp-body"><div class="sol-exp-main">${contentHTML}</div></div>

        </div>

      `;

				}

				

				

				// The change-list half of the SCM panel (conflicts + commit box +
				// changes + staged). Extracted so a git-status refresh can
				// update ONLY this region, leaving the repository/commits half
				// (and its scroll/loading state) untouched.
				

				

				

				// ─── File-type icons (VS Code style, inline SVG) ────────────────
				// Type colors are content colors (like diff +/- and git status hues),
				// intentionally fixed for cross-theme recognition. Badges are white
				// strokes on the colored file outline.

				

				// Incremental tree update: reconcile the existing tree DOM against
				// a new tree, patching only the nodes that changed (keyed by
				// data-sol-exp-path). Unchanged nodes keep their DOM, so the
				// expanded state and scroll position survive and nothing flashes.
				


				window.__solExpTab = (tab) => {

					currentTab = tab;

					render();

					if (tab === "scm") {

						// Reload status and commit history when the SCM tab
						// opens — the commit list is only populated here and
						// on explicit refresh, never by background polling.
						loadGitStatus(actionsDeps);

						loadRecentCommits(historyDeps);

					}

				};

				// A rail feature icon expands the column back and opens that
				// tab in one click (the rail itself has no body to render).
				window.__solExpRailOpen = (tab) => {

					panelCollapsed = false;

					window.__solExpTab(tab);

					applyGrid();

				};








				// ── Commit-row hover tooltip (event delegation) ─────────────
				document.addEventListener("mouseover", (e) => {
					const target = e.target;
					if (!(target instanceof Element)) return;
					// Hovering the tooltip itself keeps it alive.
					if (target.closest(".sol-exp-commit-tooltip")) { cancelHideCommitTooltip(historyDeps); return; }
					const row = target.closest(".sol-exp-commit-item");
					if (row && row.closest("#sol-exp-commits-list")) {
						cancelHideCommitTooltip(historyDeps);
						const hash = row.getAttribute("data-hash") || "";
						if (hash && hash !== state.commits.commitTipPending) {
							if (state.commits.commitTipShowTimer) clearTimeout(state.commits.commitTipShowTimer);
							state.commits.commitTipPending = hash;
							state.commits.commitTipShowTimer = setTimeout(() => {
								state.commits.commitTipShowTimer = 0;
								if (state.commits.commitTipPending === hash) showCommitTooltip(row, hash, historyDeps);
							}, 350);
						}
						return;
					}
					scheduleHideCommitTooltip(historyDeps);
				});
				document.addEventListener("mouseout", (e) => {
					const target = e.target;
					if (!(target instanceof Element)) return;
					const row = target.closest(".sol-exp-commit-item");
					if (row && !row.contains(e.relatedTarget as Node)) scheduleHideCommitTooltip(historyDeps);
				});
				// Hide tooltip on any scroll (row position is stale after scroll).
				document.addEventListener("scroll", () => hideCommitTooltip(historyDeps), true);

				const dragGuard = (e) => {

					if (activeEl?.contains(e.target)) e.preventDefault();

				};

				document.addEventListener("dragenter", dragGuard);

				document.addEventListener("dragover", dragGuard);

				document.addEventListener("drop", dragGuard);

				document.addEventListener("click", (e) => {

					if (!activeEl?.contains(e.target)) return;

					const el = e.target as HTMLElement;

					if (el.closest(".sol-exp-tree-node") || el.closest(".sol-exp-search-item") || el.closest(".sol-exp-scm-item") || el.closest(".sol-exp-context-menu") || el.closest(".sol-exp-commit-item") || el.closest(".sol-exp-commit-detail-inline")) return;

					if (state.tree.selectedPaths.size || state.tree.selectedPath) {

						state.tree.selectedPaths = /* @__PURE__ */ new Set<string>();

						state.tree.selectionAnchor = null;

						state.tree.selectedPath = null;

						render();

					}

				});

				document.addEventListener("dragend", () => {

					if (state.clipboard.dragPaths.length || state.clipboard.dropTargetPath) {

						state.clipboard.dragPaths = [];

						state.clipboard.dropTargetPath = null;

						render();

					}

				});



				window.__solExpTogglePanel = () => {

					// Expand back: drop the folded rail, restore the column at
					// its stored width preference (panelWidth was never
					// rewritten while folded).
					if (panelCollapsed) {

						panelCollapsed = false;

						render();

						applyGrid();

						return;

					}

					// Nothing to fold while the panel is closed (auto-open off
					// or no session root): the control is only reachable from
					// the expanded column, but guard anyway.
					if (panelWidth <= 0) return;

					panelCollapsed = true;

					render();

					applyGrid();

				};

				window.__solExpScmDividerDown = (e) => {
				e.preventDefault();
				// Freeze auto-refresh for the duration of the drag so a poll
				// cannot rebuild the SCM region under the pointer.
				state.scm.scmDragging = true;
				// Query inside the active panel: global queries could hit a stale
				// or duplicate SCM region after session/repo switches.
				const scope = activeEl ?? document;
				const split = scope.querySelector(".sol-exp-scm-split");
				const top = scope.querySelector(".sol-exp-scm-top") as HTMLElement;
				const bottom = scope.querySelector(".sol-exp-scm-bottom") as HTMLElement;
				if (!split || !top || !bottom) { state.scm.scmDragging = false; return; }
				const el = e.currentTarget as HTMLElement;
				try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
				const rect = split.getBoundingClientRect();
				// Guard against a zero-height split (collapsed region): fall back
				// to the panel height so the ratio never becomes NaN.
				const height = rect.height > 0 ? rect.height : (split.parentElement?.getBoundingClientRect().height ?? 300) || 300;
				const startY = e.clientY;
				const startSplit = state.scm.scmSplit;
				const onMove = (me) => {
				const dy = me.clientY - startY;
				// Re-measure each move: right after startup the split may still be
				// settling, and a stale tiny height would blow up the ratio.
				const curRect = split.getBoundingClientRect();
				const h = curRect.height > 200 ? curRect.height : height;
				const target = Math.min(85, Math.max(15, startSplit + (dy / h) * 100));
				// Clamp the per-move delta so one bad measurement cannot jump the
				// divider far down/up — the ratio only ever moves by <= 8% per move.
				const next = Math.min(Math.max(target, state.scm.scmSplit - 8), state.scm.scmSplit + 8);
				if (next === state.scm.scmSplit) return;
				state.scm.scmSplit = next;
				// Re-query each move so a refresh replacing the SCM region
				// mid-drag cannot invalidate the element references.
				const t = scope.querySelector(".sol-exp-scm-top") as HTMLElement | null;
				const b = scope.querySelector(".sol-exp-scm-bottom") as HTMLElement | null;
				if (t) t.style.flexBasis = state.scm.scmSplit + "%";
				if (b) b.style.flexBasis = (100 - state.scm.scmSplit) + "%";
				};
				const onUp = () => {
				state.scm.scmDragging = false;
				try { el.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
				document.removeEventListener("pointermove", onMove);
				document.removeEventListener("pointerup", onUp);
				document.removeEventListener("pointercancel", onUp);
				};
				document.addEventListener("pointermove", onMove);
				document.addEventListener("pointerup", onUp);
				document.addEventListener("pointercancel", onUp);
				};

				const PANEL_WIDTH_DEFAULT = 280;

				let PANEL_WIDTH = PANEL_WIDTH_DEFAULT;

				let panelAutoOpen = true;

				let settingsLoaded = false;

				const PANEL_MIN = 264;

				const PANEL_MAX = 560;

				// Collapsed rail width mirrors the native sidebar rail (56px:
				// 10px side padding + 36px control box) so the folded panel
				// reads as a sibling of the shell's own collapsed sidebar.
				const PANEL_RAIL = 56;

				let panelWidth = 0;

				let panelDragged = false;

				// Whole-panel fold state: folded shows the compact rail instead
				// of the full column. panelWidth keeps the expanded preference
				// untouched while folded, so expanding restores the exact width.
				let panelCollapsed = false;

				// ── Embedded multi-tab terminal (ConPTY via the host service) ──
				const TERM_CELL_W = 9;
				const TERM_CELL_H = 18;
				let terminalOpen = false;
				let terminalSupported = true;
				let terminalHeight = 400;
				let terminalMaxHeight = 1000;
				let terminalMaxTabs = 8;
				let terminalShell = "";
				let terminalTabs = [];
				let terminalSeq = 0;
				let terminalBusy = false;
				let terminalActiveTab = 0;
				let terminalShellEl = null;
				let terminalRebootTimer = null;
				const termLang = () => document.documentElement.lang?.startsWith("zh") === true;
				const terminalCwd = () => gitRoot() || root;
				const terminalCellSize = (el) => ({
					cols: Math.max(20, Math.floor((el?.clientWidth || 320) / TERM_CELL_W)),
					rows: Math.max(5, Math.floor((el?.clientHeight || 120) / TERM_CELL_H)),
				});
				const terminalShellName = (shell) => {
					const first = String(shell ?? "").trim().split(/\s+/)[0] || "shell";
					const base = first.replace(/\\/g, "/").split("/").pop() || first;
					return base.replace(/\.exe$/i, "");
				};

				// Localized terminal error toast: known host failures get a
				// friendly hint (with the raw detail appended for debugging).
				const showTerminalError = (msg) => {
					const raw = String(msg || "");
					if (/file not found/i.test(raw)) {
						showToast(t("terminal.shellNotFound") + (raw ? " (" + raw + ")" : ""));
					} else {
						showToast(t("terminal.startFail") + raw);
					}
				};

				const ensureTerminalShell = () => {
					if (terminalShellEl !== null) return terminalShellEl;
					const shell = document.createElement("div");
					shell.className = "sol-exp-terminal-shell";
					// Start collapsed (0 height) so the first open animates.
					shell.style.height = "0px";
					shell.style.opacity = "0";
					shell.style.display = "flex";
					shell.innerHTML = `<div class="sol-exp-term-resize"></div><div class="sol-exp-term-tabs"></div><div class="sol-exp-term-body"><div class="sol-exp-term-exited" style="display:none">${t("terminal.empty")}</div></div>`;
					terminalShellEl = shell;
					// Keep the PTY size in sync with the rendered body: any width
					// change (window, sidebar drag, layout shifts) re-fits and
					// rebuilds so pwsh wraps and redraws at the same columns.
					const sizeObs = new ResizeObserver(() => {
						if (terminalTabs.length === 0) return;
						if (Date.now() < termSettleUntil) return;
						fitTerminal();
						scheduleTerminalReboot();
					});
					const termBody = shell.querySelector(".sol-exp-term-body");
					if (termBody !== null) sizeObs.observe(termBody);
					termSizeObserver = sizeObs;
					let dragStart = null;
					const onMove = (e: PointerEvent) => {
						if (dragStart === null) return;
						terminalHeight = Math.min(terminalMaxHeight, Math.max(120, dragStart.h - (e.clientY - dragStart.y)));
						shell.style.height = terminalHeight + "px";
					};
					const onUp = () => {
						if (dragStart === null) return;
						dragStart = null;
						document.removeEventListener("pointermove", onMove);
						document.removeEventListener("pointerup", onUp);
						document.removeEventListener("pointercancel", onUp);
						// Re-enable the height transition eased back in for later
						// expand/collapse animations (disabled while dragging).
						shell.style.transition = "";
						fitTerminal();
						scheduleTerminalReboot();
					};
					const grab = shell.querySelector(".sol-exp-term-resize") as HTMLDivElement;
					grab.addEventListener("pointerdown", (e: PointerEvent) => {
						e.preventDefault();
						dragStart = { y: e.clientY, h: terminalHeight };
						// No transition while dragging: the panel must track the
						// pointer one-to-one, not ease behind it.
						shell.style.transition = "none";
						grab.setPointerCapture?.(e.pointerId);
						document.addEventListener("pointermove", onMove);
						document.addEventListener("pointerup", onUp);
						document.addEventListener("pointercancel", onUp);
					});
					return shell;
				};

				const renderTerminalTabs = () => {
					if (terminalShellEl === null) return;
					const bar = terminalShellEl.querySelector(".sol-exp-term-tabs");
					const body = terminalShellEl.querySelector(".sol-exp-term-body");
					bar.innerHTML = "";
					terminalTabs.forEach((tab, i) => {
						tab.pane.dataset.index = String(i);
						const btn = document.createElement("button");
						btn.type = "button";
						btn.className = "sol-exp-term-tab" + (i === terminalActiveTab ? " active" : "");
						btn.title = t("panel.terminal") + " " + (i + 1) + " — " + tab.shell;
						const label = document.createElement("span");
						label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left";
						label.textContent = (tab.exited ? "✕ " : "▸ ") + tab.title;
						btn.appendChild(label);
						const close = document.createElement("button");
						close.type = "button";
						close.className = "sol-exp-term-tab-close";
						close.textContent = "×";
						close.title = t("terminal.close") || t("terminal.new");
						close.addEventListener("click", (e) => { e.stopPropagation(); closeTerminalTab(i); });
						btn.appendChild(close);
						btn.addEventListener("click", () => activateTerminalTab(i));
						bar.appendChild(btn);
					});
					const add = document.createElement("button");
					add.type = "button";
					add.className = "sol-exp-term-add";
					add.title = t("terminal.new");
					add.textContent = "+";
					add.disabled = terminalBusy || terminalTabs.length >= terminalMaxTabs;
					add.addEventListener("click", () => addTerminalTab());
					bar.appendChild(add);
					body.querySelectorAll(".sol-exp-term-pane").forEach((p) => p.classList.toggle("active", p.dataset.index === String(terminalActiveTab)));
					const empty = body.querySelector(".sol-exp-term-exited");
					empty.style.display = terminalTabs.length === 0 ? "flex" : "none";
				};

				const activateTerminalTab = (i) => {
					terminalActiveTab = i;
					renderTerminalTabs();
					fitTerminal();
				};

				const fitTerminal = () => {
					const tab = terminalTabs[terminalActiveTab];
					if (!tab || !terminalOpen) return;
					try { tab.fit.fit(); } catch { /* hidden or sizing */ }
				};

				const scheduleTerminalReboot = () => {
					if (terminalRebootTimer !== null) clearTimeout(terminalRebootTimer);
					terminalRebootTimer = setTimeout(async () => {
						terminalRebootTimer = null;
						const tab = terminalTabs[terminalActiveTab];
						if (!tab || tab.exited || !terminalOpen) return;
						// Authoritative size: xterm's own post-fit cols/rows, so the
						// PTY wraps and redraws at EXACTLY the columns/rows the
						// renderer uses (an estimate like paneWidth/9 drifts from
						// the real cell width and PSReadLine's recall redraw then
						// lands on the wrong line).
						let size = { cols: tab.term.cols, rows: tab.term.rows };
						if (!size.cols || !size.rows) {
							size = terminalCellSize(tab.pane);
							size.rows = Math.max(8, Math.floor((terminalHeight - 40) / TERM_CELL_H));
						}
						// Height-only changes keep the shell alive: stale rows only
						// affect scroll-region edge cases, while a width (cols)
						// mismatch corrupts line wrapping and redraws. Reboot —
						// and with it the shell — only when cols really change.
						if (termLastSize !== null && termLastSize.cols === size.cols) return;
						termLastSize = size;
						try {
							const resp = await fetch("/solution-explorer/terminal/" + tab.id + "/reboot", {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({ rows: size.rows, cols: size.cols }),
							});
							const res = await resp.json();
							if (!res.ok) showTerminalError(res.error?.message || t("terminal.rebootFail"));
						} catch { /* keep the tab as is */ }
					}, 400);
				};

				// ONE shared SSE stream carries every tab's output — per-tab streams
				// would exhaust the browser's connection pool (~6 per origin)
				// after a few terminals.
				let terminalStreamOn = false;
				let terminalStreamCtrl = null;
				let termSizeObserver = null;
				let termSettleUntil = 0;
				let termLastSize = null;

				// Input batching: keystrokes coalesce into one POST every few ms
				// instead of one fetch per key (typing bursts stall otherwise).
				// Pending/in-flight state is PER TAB so typing in one terminal can
				// never leak keystrokes into another.
				let termInputTimer = null;
				const termInputPending = new Map();
				const termInputInFlight = new Map();
				const termInputTail = new Map();
				const flushTerminalInput = async () => {
					termInputTimer = null;
					const batch = [...termInputPending.entries()];
					termInputPending.clear();
					for (const [id, data] of batch) {
						if (data === "") continue;
						if (termInputInFlight.get(id)) {
							termInputTail.set(id, (termInputTail.get(id) || "") + data);
							continue;
						}
						termInputInFlight.set(id, true);
						(async () => {
							try {
								await fetch("/solution-explorer/terminal/" + id + "/input", {
									method: "POST",
									headers: { "content-type": "application/json" },
									body: JSON.stringify({ data }),
								});
							} catch { /* keep typing */ }
							termInputInFlight.set(id, false);
							const tail = termInputTail.get(id);
							termInputTail.set(id, "");
							if (tail) queueTerminalInput({ id }, tail);
						})();
					}
				};
				const queueTerminalInput = (tab, data) => {
					termInputPending.set(tab.id, (termInputPending.get(tab.id) || "") + data);
					if (termInputTimer === null) termInputTimer = setTimeout(flushTerminalInput, 12);
				};

				// Output coalescing: burst frames accumulate and flush to xterm
				// once per animation frame instead of one write per frame.
				let termOutputFlush = null;
				const flushTerminalOutput = () => {
					termOutputFlush = null;
					for (const tab of terminalTabs) {
						if (tab._out !== undefined && tab._out !== "") {
							const s = tab._out;
							tab._out = "";
							tab.term.write(s);
						}
					}
				};
				const queueTerminalOutput = (tab, text) => {
					tab._out = (tab._out || "") + text;
					if (termOutputFlush === null) termOutputFlush = requestAnimationFrame(flushTerminalOutput);
				};

				const ensureTerminalStream = () => {
					if (terminalStreamOn) return;
					terminalStreamOn = true;
					terminalStreamCtrl = new AbortController();
					(async () => {
						try {
							const resp = await fetch("/solution-explorer/terminal/stream", { signal: terminalStreamCtrl.signal });
							if (!resp.ok || !resp.body) {
								terminalStreamOn = false;
								// A 404 means the HOST is still running an older
								// build (the shared stream route is new) — a page
								// refresh cannot fix that; the app process must
								// fully restart.
								showToast(termLang() ? "宿主进程版本过旧，终端输出不可用——请完全退出并重启 DSH 应用" : "Host is outdated — fully restart DSH to enable terminal output");
								return;
							}
							const reader = resp.body.getReader();
							const decoder = new TextDecoder();
							let buf = "";
							while (terminalStreamOn) {
								const { done, value } = await reader.read();
								if (done) break;
								buf += decoder.decode(value, { stream: true });
								let idx;
								let frameCount = 0;
								while ((idx = buf.indexOf("\n\n")) >= 0) {
									const block = buf.slice(0, idx);
									buf = buf.slice(idx + 2);
									let ev = "";
									let data = "";
									for (const line of block.split("\n")) {
										if (line.startsWith("event:")) ev = line.slice(6).trim();
										else if (line.startsWith("data:")) data = line.slice(5).trim();
									}
									if (ev === "t" && data.includes("|")) {
										const sep = data.indexOf("|");
										const id = data.slice(0, sep);
										const b64 = data.slice(sep + 1);
										const tab = terminalTabs.find((x) => x.id === id);
										if (tab && b64) {
											try {
												// base64 → bytes → streaming UTF-8 decode:
												// feeding raw latin-1 chars to xterm breaks
												// multibyte (Chinese) output.
												const bin = window.atob(b64);
												const bytes = new Uint8Array(bin.length);
												for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
												queueTerminalOutput(tab, tab.decoder.decode(bytes, { stream: true }));
											} catch { /* bad frame */ }
										}
									} else if (ev === "end") {
										const tab = terminalTabs.find((x) => x.id === data);
										if (tab && !tab.exited) {
											try { tab.decoder.decode(); } catch { /* flush tail */ }
											if (termOutputFlush !== null) { cancelAnimationFrame(termOutputFlush); termOutputFlush = null; }
											flushTerminalOutput();
											tab.exited = true;
											tab.term.write("\r\n\x1b[90m[" + (termLang() ? "进程已退出" : "process exited") + "]\x1b[0m\r\n");
											renderTerminalTabs();
										}
									}
									// Yield during output bursts so the main thread
									// never stays blocked in this parse loop.
									if (++frameCount % 128 === 0) await new Promise((r) => setTimeout(r, 0));
								}
							}
						} catch { /* aborted or dropped */ }
						terminalStreamOn = false;
					})();
				};

				const stopTerminalStream = () => {
					terminalStreamOn = false;
					if (terminalStreamCtrl !== null) { try { terminalStreamCtrl.abort(); } catch { /* ignore */ } terminalStreamCtrl = null; }
				};

				const addTerminalTab = async () => {
					if (terminalBusy) return;
					if (!terminalSupported) { showToast(t("terminal.unsupported")); return; }
					if (root === "") { showToast(termLang() ? "先打开工作区再使用终端" : "Open a workspace first"); return; }
					if (terminalTabs.length >= terminalMaxTabs) {
						showToast(termLang() ? "最多 " + terminalMaxTabs + " 个终端标签" : "Up to " + terminalMaxTabs + " terminal tabs");
						return;
					}
					terminalBusy = true;
					renderTerminalTabs();
					try {
						const pane = document.createElement("div");
						pane.className = "sol-exp-term-pane";
						pane.dataset.index = String(terminalTabs.length);
						ensureTerminalShell().querySelector(".sol-exp-term-body").appendChild(pane);
						const term = new Terminal({
							fontSize: 13,
							fontFamily: 'Consolas, "Cascadia Mono", "Microsoft YaHei", Menlo, monospace',
							cursorBlink: true,
							allowProposedApi: false,
							theme: {
								background: "transparent",
								foreground: "#d4d4d4",
								cursorAccent: "#101010",
								selectionBackground: "rgba(75,159,255,0.30)",
								black: "#242424", red: "#f85149", green: "#3fb950", yellow: "#d29922",
								blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#d4d4d4",
								brightBlack: "#6e6e6e", brightRed: "#ff7b72", brightGreen: "#56d364",
								brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
								brightCyan: "#56d4dd", brightWhite: "#ffffff",
							},
						});
						const fit = new FitAddon();
						term.loadAddon(fit);
						term.open(pane);
						// Measure the EXACT post-fit size: stretch the shell to the
						// target height momentarily (the open animation starts
						// from 0) so xterm reports real cols/rows, then restore.
						// Creating the PTY with the true size from the first prompt
						// eliminates the occasional history-recall misplacement.
						const shellEl = ensureTerminalShell();
						const prevHeight = shellEl.style.height;
						const prevOpacity = shellEl.style.opacity;
						shellEl.style.height = terminalHeight + "px";
						shellEl.style.opacity = "1";
						let exactCols = 20;
						let exactRows = 8;
						try {
							fit.fit();
							exactCols = term.cols || 20;
							exactRows = term.rows || 8;
						} catch { /* keep fallbacks */ }
						shellEl.style.height = prevHeight;
						shellEl.style.opacity = prevOpacity;
						const resp = await fetch("/solution-explorer/terminal", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ root, cwd: terminalCwd(), shell: terminalShell || undefined, rows: exactRows, cols: exactCols }),
						});
						const res = await resp.json();
						if (!res.ok) {
							terminalSupported = res.code !== "unsupported";
							pane.remove();
							term.dispose();
							if (res.code === "unsupported") showToast(t("terminal.unsupported"));
							else showTerminalError(res.error?.message);
							return;
						}
						const tab = {
							id: res.value.id,
							shell: res.value.shell || terminalShellName(terminalShell) || "shell",
							title: terminalShellName(res.value.shell),
							pane, term, fit,
							decoder: new TextDecoder(),
							exited: false, aborted: false,
						};
						terminalSeq++;
						terminalTabs.push(tab);
						terminalActiveTab = terminalTabs.length - 1;
						try { fit.fit(); } catch { /* zero-size parent */ }
						term.onData((data) => queueTerminalInput(tab, data));
						renderTerminalTabs();
						ensureTerminalStream();
					} catch (err) {
						showTerminalError(err instanceof Error ? err.message : String(err));
					} finally {
						terminalBusy = false;
						renderTerminalTabs();
					}
				};

				const closeTerminalTab = async (i) => {
					const tab = terminalTabs[i];
					if (!tab) return;
					tab.aborted = true;
					if (terminalRebootTimer !== null) { clearTimeout(terminalRebootTimer); terminalRebootTimer = null; }
					terminalTabs.splice(i, 1);
					if (terminalActiveTab >= terminalTabs.length) terminalActiveTab = Math.max(0, terminalTabs.length - 1);
					fetch("/solution-explorer/terminal/" + tab.id, { method: "DELETE" }).catch(() => {});
					try { tab.term.dispose(); } catch { /* already gone */ }
					tab.pane.remove();
					// Closing the last terminal collapses the whole bottom panel.
					if (terminalTabs.length === 0) {
						terminalOpen = false;
						syncTerminalUI();
						render(); // refresh the rail/activity toggle active state
						return;
					}
					renderTerminalTabs();
					fitTerminal();
				};

				const terminalCenterCol = () => {
					if (panelFrame === null) return null;
					for (const child of panelFrame.children) {
						if (getComputedStyle(child).gridColumnStart === "2") return child;
					}
					return panelFrame.children[1] ?? null;
				};

				const placeTerminal = () => {
					if (terminalShellEl === null) return;
					terminalShellEl.remove();
					if (!terminalOpen) return;
					const centerEl = terminalCenterCol();
					if (centerEl === null) return;
					// The terminal lives INSIDE the center column's flow, as its
					// last child: it spans exactly the column width (between the
					// two sidebars) and the composer above it moves up with the
					// reflow — no overlay, no z-index, nothing floats.
					const cs = getComputedStyle(centerEl);
					if (cs.display !== "flex" && cs.display !== "inline-flex" && cs.display !== "-webkit-flex") {
						centerEl.style.display = "flex";
						centerEl.style.flexDirection = "column";
						const first = centerEl.firstElementChild;
						if (first !== null) { first.style.flex = "1 1 0%"; first.style.minHeight = "0"; }
					}
					centerEl.appendChild(terminalShellEl);
				};

				const syncTerminalUI = () => {
					if (terminalOpen) {
						const shell = ensureTerminalShell();
						// Ignore size events during the open/close animation so
						// the height transition can't trigger resize-rebuilds.
						termSettleUntil = Date.now() + 420;
						shell.style.transition = "height .2s cubic-bezier(.2,.7,.3,1), opacity .16s ease";
						shell.style.display = "flex";
						placeTerminal();
						ensureTerminalStream();
						// From 0 → target height on the next frames so the CSS
						// transition actually animates (0 was the resting state).
						shell.style.height = "0px";
						shell.style.opacity = "0";
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								shell.style.height = terminalHeight + "px";
								shell.style.opacity = "1";
								window.setTimeout(() => { fitTerminal(); scheduleTerminalReboot(); }, 260);
							});
						});
					} else {
						if (terminalShellEl !== null) {
							terminalShellEl.style.transition = "height .18s cubic-bezier(.2,.7,.3,1), opacity .14s ease";
							terminalShellEl.style.height = "0px";
							terminalShellEl.style.opacity = "0";
							// Leave the zero-height shell attached: it occupies no
							// layout space, so the composer stays where it is.
						}
						// The shared stream stays open: sessions survive a panel
						// close and reopen with their output intact. It is only
						// torn down on page unload (see cleanups).
					}
				};

				const toggleTerminal = () => {
					if (!terminalSupported && !terminalOpen) { showToast(t("terminal.unsupported")); return; }
					terminalOpen = !terminalOpen;
					syncTerminalUI();
					render(); // refresh rail strip / activity button active state
					if (terminalOpen && terminalTabs.length === 0) addTerminalTab();
				};
				window.__solExpToggleTerminal = toggleTerminal;
				const onWindowResize = () => { fitTerminal(); scheduleTerminalReboot(); };
				window.addEventListener("resize", onWindowResize);

				// Pull the user-editable panel config (settings page). Settings
				// are STARTUP DEFAULTS only: they decide the initial width when
				// the panel first appears. After that the drag owns the width —
				// nothing here follows the sidebar or rewrites a dragged value.
				const applySettings = () => {
					fetch("/solution-explorer/settings").then((r) => r.json()).then((res) => {
						if (res && res.ok && res.value) {
							if (typeof res.value.defaultWidth === "number" && res.value.defaultWidth >= PANEL_MIN && res.value.defaultWidth <= PANEL_MAX) PANEL_WIDTH = res.value.defaultWidth;
							if (typeof res.value.autoOpen === "boolean") panelAutoOpen = res.value.autoOpen;
							if (typeof res.value.terminalHeight === "number") terminalHeight = res.value.terminalHeight;
							if (typeof res.value.terminalMaxHeight === "number") terminalMaxHeight = res.value.terminalMaxHeight;
							if (terminalHeight > terminalMaxHeight) terminalHeight = terminalMaxHeight;
							if (typeof res.value.terminalMaxTabs === "number") terminalMaxTabs = res.value.terminalMaxTabs;
							if (typeof res.value.terminalShell === "string") terminalShell = res.value.terminalShell;
							// Re-apply immediately to an already-open terminal:
							// height follows the saved value; the + button and tab
							// cap follow maxTabs. (Shell changes affect NEW tabs.)
							if (terminalOpen && terminalShellEl !== null) {
								terminalShellEl.style.height = terminalHeight + "px";
								placeTerminal();
								window.setTimeout(fitTerminal, 60);
								renderTerminalTabs();
							}
							settingsLoaded = true;
							// Width/visibility are first-time defaults only —
							// never after a drag. The tree, however, always
							// reloads so filter/show-hidden changes apply.
							if (root !== "" && !panelDragged && panelFrame !== null) {
								panelWidth = panelAutoOpen ? PANEL_WIDTH : 0;
								// A zero width means "closed": no folded rail may
								// linger after settings re-apply (e.g. autoOpen off).
								if (panelWidth === 0) panelCollapsed = false;
								applyGrid();
							}
							if (root !== "") loadTree({ state, render });
						}
					}).catch(() => {});
				};
				applySettings();
				window.addEventListener("sol-exp-settings-saved", applySettings);


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

					const m = /^(-?[\\d.]+)px$/.exec(String(track ?? "").trim());

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

					// Folded: the column keeps a fixed narrow rail (mirrors the
					// native collapsed sidebar); expanded it uses the width
					// preference.
					const track = panelCollapsed ? PANEL_RAIL : panelWidth;

					const value = `${shellTracks[0]} minmax(0, 1fr) ${shellTracks[2]} ${Math.round(track)}px`;
					panelFrame.style.gridTemplateColumns = value;
					lastGridApplied = value;

					if (panelCol !== null) panelCol.style.visibility = panelCollapsed || panelWidth > 0 ? "visible" : "hidden";

					if (resizeHandle !== null) {
						// The collapsed rail is fixed-width: no resize handle
						// while folded (native sidebar behavior).
						if (panelCollapsed) {
							resizeHandle.style.display = "none";
							return;
						}
						resizeHandle.style.display = "";
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

							// A drag owns the width: settings never rewrite it
							// again until the next software start.
							panelDragged = true;

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

					// Panel is mounted: re-apply the persisted settings so
					// autoOpen/width/symmetry land even if the settings fetch
					// resolved before the frame existed.
					applySettings();

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

					if (newRoot !== "") {
						// Settings have not loaded yet: do not flash the panel
						// open with defaults; mountColumn re-applies once ready.
						if (!settingsLoaded) {
							panelWidth = 0;
						} else if (!panelDragged) {
							panelWidth = panelAutoOpen ? PANEL_WIDTH : 0;
						}
						// panelDragged: keep the dragged width across session
						// switches — the user's drag owns it until restart.
					} else {
						panelWidth = 0;
					}

					// A zero width means "closed": no folded rail may linger
					// when the panel is closed (no root yet, or auto-open off).
					if (panelWidth === 0) panelCollapsed = false;

					if (panelFrame !== null) applyGrid();

					root = newRoot;

					state.tree.treeState = null;

					state.scm.gitStatus = null;

					state.scm.gitChangesCount = 0;

					// Invalidate any in-flight commits fetch from the previous
					// conversation and drop the cached list so the new repo's
					// history starts from the loading placeholder.
					state.commits.commitsSeq++;

					state.commits.commitsHTML = null;

					state.commits.commitsPage = 0;

					state.commits.commitsAllLoaded = false;

					state.commits.commitsLoading = false;
					state.commits.commitDetailCache.clear();
					state.commits.remotesResolved = false;

					state.tree.loading = root !== "";

					render();

					if (root) {

						state.scm.activeRepo = "";

						loadTree({ state, render });

						loadRepos(actionsDeps);

						loadGitStatus(actionsDeps);

					}

				}

				const unsub = ctx.sessions.list.subscribe(handleSessionChange);

				handleSessionChange();

				waitForFrame();

				// Auto-refresh the visible tab in place (incremental reconcile —
				// no loading flash): the file tree or the SCM region, whichever
				// is on screen, patched locally every few seconds.
				const autoRefreshTimer = setInterval(() => {

					if (root === "" || document.visibilityState !== "visible" || state.scm.scmDragging) return;

					if (currentTab === "scm") loadGitStatus(actionsDeps);

					else if (currentTab === "explorer") refreshTreeSilent({ state, render });

				}, 4000);

				console.log("[sol-exp] injecting __solExpOpenFile");

				window.__solExpOpenFile = async (path) => {

					diffStore.path = null;

					diffStore.content = null;

					diffStore.loading = false;

					notifyDiffListeners();

					editorStore.file = path;

					editorStore.content = null;

					editorStore.loading = true;

					editorStore.error = null;

					editorStore.unsupported = false;

					editorStore.image = false;

					editorStore.root = root;

					notifyEditorListeners();

					try {

						const result = await (await fetch("/solution-explorer/read?root=" + encodeURIComponent(root) + "&file=" + encodeURIComponent(path))).json();

						if (result.ok) if (result.value.image) {

							editorStore.image = true;

							editorStore.content = null;

						} else if (result.value.supported === false) {

							editorStore.unsupported = true;

							editorStore.content = null;

						} else editorStore.content = result.value.content;

						else editorStore.error = result.error?.message || "Failed to read file";

					} catch (err) {

						editorStore.error = err.message || String(err);

					}

					editorStore.loading = false;

					notifyEditorListeners();

					setTimeout(() => {

						const tab = Array.from(document.querySelectorAll("[role=\"tab\"]")).find((el) => el.textContent === (document.documentElement.lang?.startsWith("zh") ? "编辑" : "Edit")) as HTMLElement | null;

						if (tab) tab.click();

					}, 50);

				};

				window.__solExpSaveFile = async () => {

					if (!editorStore.file || editorStore.content === null) return;

					editorStore.saving = true;

					notifyEditorListeners();

					try {

						const result = await (await fetch("/solution-explorer/write", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({

								root,

								path: editorStore.file,

								content: editorStore.content

							})

						})).json();

						if (!result.ok) alert("保存失败: " + (result.error?.message || ""));

						else { await loadGitStatus(actionsDeps); await loadTree({ state, render }); }

					} catch (err) {

						alert("保存失败: " + (err.message || String(err)));

					}

					editorStore.saving = false;

					notifyEditorListeners();

				};

				window.__solExpGetEditorState = () => ({

					editorFile: editorStore.file,

					editorContent: editorStore.content,

					editorLoading: editorStore.loading,

					editorError: editorStore.error,

					editorSaving: editorStore.saving,

					editorUnsupported: editorStore.unsupported,

					editorImage: editorStore.image,

					editorRoot: editorStore.root

				});

				window.__solExpEditorListeners = editorStore.listeners;

				window.__solExpOpenDiff = async (path, staged) => {

					diffStore.path = path;

					diffStore.staged = staged;

					diffStore.root = root;

					diffStore.content = null;

					diffStore.oldContent = "";

					diffStore.newContent = "";

					diffStore.loading = true;

					diffStore.unsupported = false;

					notifyDiffListeners();

					try {

						const result = await (await fetch("/solution-explorer/git-diff?root=" + encodeURIComponent(gitRoot()) + "&file=" + encodeURIComponent(path) + "&staged=" + staged)).json();

						if (result.ok) { diffStore.unsupported = result.value.unsupported === true; if (diffStore.unsupported) { diffStore.content = null; diffStore.oldContent = ""; diffStore.newContent = "" } else { diffStore.content = result.value.diff ?? result.value; diffStore.oldContent = result.value.oldContent ?? ""; diffStore.newContent = result.value.newContent ?? "" } }

						else { diffStore.content = null; diffStore.oldContent = ""; diffStore.newContent = "" }

					} catch {

						diffStore.content = null;

						diffStore.oldContent = "";

						diffStore.newContent = "";

					}

					diffStore.loading = false;

					notifyDiffListeners();

					setTimeout(() => {

						const tab = Array.from(document.querySelectorAll("[role=\"tab\"]")).find((el) => el.textContent === (document.documentElement.lang?.startsWith("zh") ? "编辑" : "Edit")) as HTMLElement | null;

						if (tab) tab.click();

					}, 50);

				};

				window.__solExpGetDiffState = () => ({

					diffPath: diffStore.path,

					diffStaged: diffStore.staged,

					diffContent: diffStore.content,

					diffOldContent: diffStore.oldContent,

					diffNewContent: diffStore.newContent,

					diffLoading: diffStore.loading,

					diffUnsupported: diffStore.unsupported,

					diffRoot: diffStore.root

				});

				window.__solExpDiffListeners = diffStore.listeners;

				// History deps: injected into scm/history functions.
				const historyDeps = { state, loadRemotes };

				// Actions deps: injected into scm/actions functions.
				const actionsDeps = { state, render, loadRecentCommits };

				// Branches deps: injected into scm/branches functions.
				const branchesDeps = { state };

				// SCM bridges deps: injected into scm/bridges.
				const scmBridgesDeps = {
					state, render,
					actionsDeps, historyDeps, branchesDeps,
					loadGitStatus, loadRepos, loadRecentCommits, loadRemotes, loadBranches, loadTags,
					loadCommitsPage, getCommitDetail, ensureCommitDetailInline, hideCommitTooltip,
					doStage, doUnstage, doDiscard, doCommit,
				};

				// Explorer bridges (tree interaction + search + clipboard +
				// context-menu) — registered from their domain modules.
				const explorerDisposers = [
					registerTreeBridges({ state, render, loadGitStatus }),
					registerSearchBridges({ state, render }),
					registerClipboardBridges({ state, render, loadGitStatus }),
					registerContextMenuBridges({ state, render, loadGitStatus }),
					registerScmBridges(scmBridgesDeps),
				];

				return () => {

					for (const d of explorerDisposers) d();

					unsub();

					styleObs?.disconnect();

					sizeObs?.disconnect();

					mountObs?.disconnect();

					if (panelFrame !== null && panelCol !== null) panelCol.remove();

					if (terminalShellEl !== null) terminalShellEl.remove();

					if (termSizeObserver !== null) { termSizeObserver.disconnect(); termSizeObserver = null; }

					stopTerminalStream();

					if (termInputTimer !== null) { clearTimeout(termInputTimer); termInputTimer = null; }

					if (termOutputFlush !== null) { cancelAnimationFrame(termOutputFlush); termOutputFlush = null; }

					for (const tab of terminalTabs) { fetch("/solution-explorer/terminal/" + tab.id, { method: "DELETE" }).catch(() => {}); }

					terminalTabs = [];

					window.removeEventListener("resize", onWindowResize);

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

						"__solExpTogglePanel",

						"__solExpRailOpen",

						"__solExpToggleTerminal",

						"__solExpClearSearch",

						"__solExpDeleteFile",

						"__solExpRename",

						"__solExpRenameCommit",

						"__solExpRenameCancel",

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


					document.removeEventListener("dragenter", dragGuard);

					document.removeEventListener("dragover", dragGuard);

					document.removeEventListener("drop", dragGuard);

					window.removeEventListener("sol-exp-settings-saved", applySettings);

					clearInterval(autoRefreshTimer);

				};

			}, "dsh-solution-explorer: wiring");
}
