/**
 * File-tree rendering & loading — explorer domain.
 * View functions receive their state slices explicitly (tree/clipboard);
 * loaders receive deps = { state, render } injected from panel.ts.
 * @module dsh-solution-explorer/client/explorer/tree-render
 */

import { t } from "../locales.ts"

import { escapeHtml } from "../shared/dom.ts"

import { folderIcon, fileIcon, gitStatusClass } from "./icons.ts"

import type { AppState, TreeState, ClipboardState } from "../state/store.ts"

export interface Deps {
  state: AppState
  render: () => void
}

export async function loadTree({ state, render }: Deps) {

					if (!state.root) return;

					const seq = ++state.loadSeq;

					// First load (no tree yet) shows the loading state; later
					// loads reconcile in place so nothing flashes.
					const hadTree = !!state.tree.treeState;

					if (!hadTree) {

						state.tree.loading = true;

						state.tree.error = null;

						render();

					}

					try {

						const result = await (await fetch(`/solution-explorer/tree?root=${encodeURIComponent(state.root)}`)).json();

						if (seq !== state.loadSeq || state.root === "") return;

						if (result.ok) {

							state.tree.treeState = result.value;

							if (hadTree) {

								const container = state.activeEl ? state.activeEl.querySelector(".sol-exp-tree") : null;

								if (container) reconcileTree(container, state.tree.treeState.children || [], 0, state.tree, state.clipboard);

								else render();

							} else {

								render();

							}

						} else if (!hadTree) {

							state.tree.error = result.error?.message || "Failed to load tree";

						}

					} catch (err) {

						if (seq !== state.loadSeq) return;

						if (!hadTree) state.tree.error = err instanceof Error ? err.message : String(err);

					}

					state.tree.loading = false;

					if (!hadTree) render();

				}

export async function refreshTreeSilent({ state, render }: Deps) {

					if (!state.root || !state.tree.treeState) return;

					const seq = ++state.loadSeq;

					try {

						const result = await (await fetch(`/solution-explorer/tree?root=${encodeURIComponent(state.root)}`)).json();

						if (seq !== state.loadSeq || state.root === "") return;

						if (result.ok && result.value) {

							state.tree.treeState = result.value;

							const container = state.activeEl ? state.activeEl.querySelector(".sol-exp-tree") : null;

							if (container) reconcileTree(container, state.tree.treeState.children || [], 0, state.tree, state.clipboard);

						}

					} catch { /* silent — keep the current tree */ }

				}

export function buildExplorerContent(tree: TreeState, clipboard: ClipboardState, root: string): string {

					const emptyText = t("panel.empty");

					let contentHTML = "";

					if (tree.loading) contentHTML = `<div class="sol-exp-loading">${t("loading")}</div>`;

					else if (tree.error) contentHTML = `<div class="sol-exp-error">${tree.error}</div>`;

					else if (tree.treeState) contentHTML = "<div class=\"sol-exp-tree\" oncontextmenu=\"event.preventDefault();event.stopPropagation();window.__solExpContextMenu('', event.pageX, event.pageY, false)\" ondragover=\"event.preventDefault();event.stopPropagation()\" ondrop=\"event.preventDefault();event.stopPropagation();window.__solExpDrop('', event)\">" + (tree.treeState.children || []).map((c) => renderTreeNode(c, 0, tree, clipboard)).join("") + "</div>";

					else contentHTML = `<div class="sol-exp-empty">${emptyText}</div>`;

					return `

        <div class="sol-exp-header">

          <span class="sol-exp-title">${root ? root.split(/[\\\/]/).pop() || root : ""}</span>

          <div class="sol-exp-header-actions">

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpExpandAll()" title="${t("tree.expand")}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11"/><path d="M2.5 7.5h11"/><path d="M2.5 11.5h6"/><path d="M10.6 10.4l2.4 2.2 2.4-2.2"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpCollapseAll()" title="${t("tree.collapse")}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11"/><path d="M2.5 7.5h11"/><path d="M2.5 11.5h6"/><path d="M10.6 14.2l2.4-2.2 2.4 2.2"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpNew('file', '')" title="${document.documentElement.lang?.startsWith("zh") ? "新建文件" : "New file"}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 1.5h3.5L12.5 5v8.5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpNew('dir', '')" title="${document.documentElement.lang?.startsWith("zh") ? "新建文件夹" : "New folder"}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4.5h3.5l1.5 1.5H13a1.5 1.5 0 0 1 1.5 1.5v4.5a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12v-7.5z"/></svg></button>

            <button class="sol-exp-toolbar-btn" onclick="window.__solExpRefresh()" title="${document.documentElement.lang?.startsWith("zh") ? "刷新" : "Refresh"}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"/><path d="M13.5 3.5V7H10"/></svg></button>

          </div>



        </div>

        <div class="sol-exp-content">${contentHTML}</div>

      `;

				}

export function renderTreeNode(node: any, depth: number, tree: TreeState, clipboard: ClipboardState): string {

					if (!node) return "";

					const isDir = node.type === "directory";

					const isExpanded = tree.expandedPaths.has(node.path);

					const isSelected = tree.selectedPaths.has(node.path);

					const isCut = clipboard.clipboard?.mode === "cut" && clipboard.clipboard.paths.includes(node.path);

					const isDropTarget = isDir && clipboard.dropTargetPath === node.path && clipboard.dragPaths.length > 0;

					const hasChildren = isDir && node.children && node.children.length > 0;

					const padding = 12 + depth * 16;

					// Map git status letters to stable shared class suffixes.
					const gitCls = node.gitStatus ? gitStatusClass(node.gitStatus) : "";

					const pathJs = node.path.replace(/'/g, "\\'").replace(/\\/g, "\\\\");

					const chevron = isDir ? hasChildren ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:${isExpanded ? "rotate(90deg)" : "rotate(0deg)"};transition:transform .15s ease"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>` : "<span style=\"width:16px;display:inline-block\"></span>" : "<span style=\"width:16px;display:inline-block\"></span>";

					const icon = isDir ? folderIcon(isExpanded) : fileIcon(node.name);

					const childrenHTML = isDir && isExpanded && hasChildren ? `<div class="sol-exp-tree-children">${node.children.map((c) => renderTreeNode(c, depth + 1, tree, clipboard)).join("")}</div>` : "";

					return `

        <div class="sol-exp-tree-node-wrapper">

          <div class="sol-exp-tree-node ${isSelected ? "sol-exp-selected" : ""}${isCut ? " sol-exp-cut" : ""}${isDropTarget ? " sol-exp-drop-target" : ""}"

               style="padding-left:${padding}px"

               draggable="true"

               onclick="window.__solExpSelect('${pathJs}', event.shiftKey, event.ctrlKey || event.metaKey, ${isDir})"

               ${isDir ? "" : `ondblclick="window.__solExpOpenFile('${pathJs}')"`}

               ondragstart="window.__solExpDragStart('${pathJs}')"

               ${isDir ? `ondragover="event.preventDefault();event.stopPropagation();window.__solExpDragOver('${pathJs}')" ondrop="event.preventDefault();event.stopPropagation();window.__solExpDrop('${pathJs}', event)` : ""}

               data-sol-exp-path="${escapeHtml(node.path)}"

               data-sol-exp-isdir="${isDir ? "1" : "0"}"

               oncontextmenu="event.preventDefault();event.stopPropagation();window.__solExpContextMenu(this.dataset.solExpPath||'', event.pageX, event.pageY, this.dataset.solExpIsdir === '1')">

            <span class="sol-exp-chevron">${chevron}</span>

            <span class="sol-exp-file-icon">${icon}</span>

            ${node.path === tree.renamingPath
              ? `<input class="sol-exp-rename-input" data-sol-exp-rename="1" value="${escapeHtml(node.name)}" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')window.__solExpRenameCommit(this.value);else if(event.key==='Escape')window.__solExpRenameCancel()" onblur="window.__solExpRenameCommit(this.value)" />`
              : `<span class="sol-exp-file-name${gitCls ? " sol-exp-git-" + gitCls : ""}">${escapeHtml(node.name)}</span>`}

            ${node.gitStatus ? `<span class="sol-exp-git-letter sol-exp-git-${gitCls}">${node.gitStatus}</span>` : ""}

          </div>

          ${childrenHTML}

        </div>

      `;

				}

export function reconcileTree(container: any, nodes: any[] | undefined, depth: number, tree: TreeState, clipboard: ClipboardState): void {

					if (!container || !nodes) return;

					const existing = new Map();

					for (const wrapper of container.children) {

						const row = wrapper.firstElementChild;

						const p = row ? row.getAttribute("data-sol-exp-path") : null;

						if (p !== null && p !== undefined) existing.set(p, wrapper);

					}

					const seen = new Set();

					const tmp = document.createElement("div");

					for (let i = 0; i < nodes.length; i++) {

						const node = nodes[i];

						seen.add(node.path);

						const wrapper = existing.get(node.path);

						if (wrapper) {

							// Rebuild this node's row only when its content
							// actually changed (name/git status/state) — an
							// unchanged row keeps its DOM untouched so the
							// tree does not repaint on every refresh.
							tmp.innerHTML = renderTreeNode(node, depth, tree, clipboard);

							const newRow = tmp.querySelector(".sol-exp-tree-node");

							const oldRow = wrapper.querySelector(".sol-exp-tree-node");

							if (newRow && oldRow && newRow.outerHTML !== oldRow.outerHTML) oldRow.replaceWith(newRow);

							const isDir = node.type === "directory";

							if (isDir && tree.expandedPaths.has(node.path)) {

								const childBox = wrapper.querySelector(".sol-exp-tree-children");

								if (childBox && node.children) reconcileTree(childBox, node.children, depth + 1, tree, clipboard);

							}

						} else {

							// New node: build its wrapper and insert it before
							// the next existing sibling (keeps order stable).
							tmp.innerHTML = renderTreeNode(node, depth, tree, clipboard);

							const newWrapper = tmp.firstElementChild;

							if (!newWrapper) continue;

							let ref = null;

							for (let j = i + 1; j < nodes.length; j++) {

								if (existing.has(nodes[j].path)) { ref = existing.get(nodes[j].path); break; }

							}

							container.insertBefore(newWrapper, ref);

						}

					}

					// Remove wrappers that no longer exist in the new tree.
					for (const [p, wrapper] of existing) {

						if (!seen.has(p)) wrapper.remove();

					}

				}
