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

export function mountPanel(ctx: ClientContext): void {
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
				// Persisted collapsed state of SCM sections. Kept in state (not
				// only as a DOM class) so any render() / silent refresh rebuilds
				// the section with the class — otherwise the repository section
				// (and the top-half sections after a status refresh) silently
				// re-expand and the collapse button looks broken.
				let collapsedSections = /* @__PURE__ */ new Set<string>();

				let selectedPath = null;

				let selectedPaths = /* @__PURE__ */ new Set<string>();

				let renamingPath = "";

				let selectionAnchor = null;

				let clipboard = null;

				let dragPaths = [];

				let dropTargetPath = null;

				let gitStatus = null;
				let gitStatusChanged = true;
				let lastHeadHash = "";
				let repos = [];
				let activeRepo = "";
				const gitRoot = () => activeRepo || root;

				let commitMessage = "";

				let committing = false;
				let commitsPage = 0;
				let commitsAllLoaded = false;
				let commitsLoading = false;
				// Cached innerHTML of the recent-commits list: null = not loaded
				// yet (render shows the loading placeholder), "" = loaded but
				// empty. render() rebuilds the list from this cache, so a render
				// landing after the git-log response can never wipe a filled
				// list back to the placeholder (e.g. tree/repos loads finishing
				// late after a conversation switch).
				let commitsHTML: string | null = null;
				// Generation counter: bumped on every reload/switch so a git-log
				// fetch still in flight for the previous repo/branch is discarded
				// instead of writing stale commits into the current list.
				let commitsSeq = 0;
				let graphLanes = [];
				let graphPrevLanes = [];
				let graphDetailOpen = "";
				let graphColorInUse = new Set();
				// Commit-detail cache (hash -> detail) shared by the inline
				// expansion and the hover tooltip; cleared on session change.
				let commitDetailCache = new Map();
				// Hover tooltip state for commit rows (custom tooltip replaces
				// the native title attribute).
				let commitTipEl: HTMLElement | null = null;
				let commitTipHash = "";       // hash currently shown in the tooltip
				let commitTipPending = "";     // hash queued to show after hover delay
				let commitTipShowTimer: any = 0;
let commitTipHideTimer: any = 0;
				// Remotes fetch guard for the "open on GitHub" tooltip link.
				let remotesResolved = false;
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

					// During a divider drag the SCM DOM must stay untouched: any
					// rebuild here would reset flex-basis from the dragged pixel
					// value back to the percentage default and make the divider
					// jump (visible on the first drag after startup).
					if (scmDragging) return;

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
						activeEl.innerHTML = `<div class="sol-exp-panel sol-exp-panel-rail"><button class="sol-exp-rail-btn" title="${document.documentElement.lang?.startsWith("zh") ? "展开面板" : "Expand panel"}" onclick="window.__solExpTogglePanel()"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z"/></svg></button><button class="sol-exp-rail-icon" title="${t("panel.explorer")}" onclick="window.__solExpRailOpen('explorer')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h5l1.5 1.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button><button class="sol-exp-rail-icon" title="${t("file.search")}" onclick="window.__solExpRailOpen('search')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M9.8 9.8L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><button class="sol-exp-rail-icon" title="${t("panel.scm")}" onclick="window.__solExpRailOpen('scm')"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M6 5C6 4.44772 6.44772 4 7 4C7.55228 4 8 4.44772 8 5C8 5.55228 7.55228 6 7 6C6.44772 6 6 5.55228 6 5ZM8 7.82929C9.16519 7.41746 10 6.30622 10 5C10 3.34315 8.65685 2 7 2C5.34315 2 4 3.34315 4 5C4 6.30622 4.83481 7.41746 6 7.82929V16.1707C4.83481 16.5825 4 17.6938 4 19C4 20.6569 5.34315 22 7 22C8.65685 22 10 20.6569 10 19C10 17.7334 9.21506 16.6501 8.10508 16.2101C8.45179 14.9365 9.61653 14 11 14H13C16.3137 14 19 11.3137 19 8V7.82929C20.1652 7.41746 21 6.30622 21 5C21 3.34315 19.6569 2 18 2C16.3431 2 15 3.34315 15 5C15 6.30622 15.8348 7.41746 17 7.82929V8C17 10.2091 15.2091 12 13 12H11C9.87439 12 8.83566 12.3719 8 12.9996V7.82929ZM18 6C18.5523 6 19 5.55228 19 5C19 4.44772 18.5523 4 18 4C17.4477 4 17 4.44772 17 5C17 5.55228 17.4477 6 18 6ZM6 19C6 18.4477 6.44772 18 7 18C7.55228 18 8 18.4477 8 19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19Z" fill="currentColor"/></svg>${gitChangesCount > 0 ? `<span class="sol-exp-activity-badge">${gitChangesCount}</span>` : ""}</button><button class="sol-exp-rail-icon sol-exp-terminal-toggle${terminalOpen ? " active" : ""}" title="${document.documentElement.lang?.startsWith("zh") ? "终端" : "Terminal"}" onclick="window.__solExpToggleTerminal()"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 5.5l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 10.5h2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>`;

						return;

					}

					activeEl.innerHTML = buildHTML();
					hideCommitTooltip();
					reapplyCommitDetailInline();

				}

				async function loadTree() {

					if (!root) return;

					const seq = ++loadSeq;

					// First load (no tree yet) shows the loading state; later
					// loads reconcile in place so nothing flashes.
					const hadTree = !!treeState;

					if (!hadTree) {

						loading = true;

						error = null;

						render();

					}

					try {

						const result = await (await fetch(`/solution-explorer/tree?root=${encodeURIComponent(root)}`)).json();

						if (seq !== loadSeq || root === "") return;

						if (result.ok) {

							treeState = result.value;

							if (hadTree) {

								const container = activeEl ? activeEl.querySelector(".sol-exp-tree") : null;

								if (container) reconcileTree(container, treeState.children || [], 0);

								else render();

							} else {

								render();

							}

						} else if (!hadTree) {

							error = result.error?.message || "Failed to load tree";

						}

					} catch (err) {

						if (seq !== loadSeq) return;

						if (!hadTree) error = err instanceof Error ? err.message : String(err);

					}

					loading = false;

					if (!hadTree) render();

				}

				// Silent auto-refresh: pull a new tree and reconcile it into the
				// existing DOM (no loading state, no flash); failures keep the
				// current tree untouched.
				async function refreshTreeSilent() {

					if (!root || !treeState) return;

					const seq = ++loadSeq;

					try {

						const result = await (await fetch(`/solution-explorer/tree?root=${encodeURIComponent(root)}`)).json();

						if (seq !== loadSeq || root === "") return;

						if (result.ok && result.value) {

							treeState = result.value;

							const container = activeEl ? activeEl.querySelector(".sol-exp-tree") : null;

							if (container) reconcileTree(container, treeState.children || [], 0);

						}

					} catch { /* silent — keep the current tree */ }

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
					commitDetailCache.clear();
					remotesResolved = false;
					loadGitStatus();
					loadRecentCommits();
					// Update the repository selection highlight and the change
					// list in place (loadGitStatus no longer re-renders).
					if (activeEl && currentTab === "scm") {
						activeEl.querySelectorAll(".sol-exp-repo-item").forEach((el) => {
							el.classList.toggle("active", el.getAttribute("data-repo-path") === path);
						});
						const scmTop = activeEl.querySelector(".sol-exp-scm-top");
						if (scmTop) scmTop.innerHTML = buildSCMTopHTML();
					}
				};
async function loadGitStatus() {

					if (!root) return;

					const hadStatus = !!gitStatus;

					try {

						const result = await (await fetch(`/solution-explorer/git-status?root=${encodeURIComponent(gitRoot())}`)).json();

						if (result.ok) {

							const prev = gitStatus;

							gitStatus = result.value;

							gitChangesCount = (result.value.staged?.length || 0) + (result.value.unstaged?.length || 0) + (result.value.untracked?.length || 0);

							// Remember whether the UI-relevant status changed. Only
							// the branch and the change lists drive the SCM view;
							// ignored/ahead/behind may jitter between polls and
							// must not force a rebuild (which would interrupt a
							// divider drag).
							gitStatusChanged = prev === null
								|| JSON.stringify([prev.branch, prev.staged, prev.unstaged, prev.untracked, prev.conflicts])
								!== JSON.stringify([gitStatus.branch, gitStatus.staged, gitStatus.unstaged, gitStatus.untracked, gitStatus.conflicts]);

							// Detect a HEAD change (external commit or checkout) and reload the commit
							// history so a command-line git commit shows up without a manual refresh.
							const head = typeof gitStatus.head === "string" ? gitStatus.head : "";
							if (head && head !== lastHeadHash) {
								lastHeadHash = head;
								if (hadStatus && currentTab === "scm") loadRecentCommits();
							}

							// Update the sync counter (↑ahead ↓behind) in place when
							// it changed — e.g. after a command-line git commit —
							// without rebuilding the repository section.
							if (hadStatus && activeEl && (prev?.ahead !== gitStatus.ahead || prev?.behind !== gitStatus.behind)) {
								const repoCount = activeEl.querySelector('.sol-exp-scm-section[data-section="repository"] .sol-exp-scm-section-count');
								if (repoCount) {
									const a = gitStatus.ahead || 0;
									const b = gitStatus.behind || 0;
									repoCount.textContent = (a > 0 || b > 0) ? `↑${a} ↓${b}` : "";
								}
							}

						}

					} catch {}

					// First load renders the panel; later loads update only
					// the SCM region and the badge, leaving the tree alone.
					if (!hadStatus) render();

					else if (gitStatusChanged && activeEl) {

						const scmHost = activeEl.querySelector("[data-sol-exp-scm-host]");

						if (scmHost && currentTab === "scm") {

							// Update only the change-list half; the repository
							// half (commits list, scroll state) stays untouched.
							// Compare before writing so an unchanged region is
							// never repainted, even if the change flag jitters.
							const scmTop = scmHost.querySelector(".sol-exp-scm-top");

							if (scmTop) {

								const html = buildSCMTopHTML();

								if (scmTop.innerHTML !== html) {

									console.log("[sol-exp] rebuild scm top", Date.now());

									scmTop.innerHTML = html;

								}

							}

						}

						const badge = activeEl.querySelector(".sol-exp-activity-badge");

						if (badge) {

							if (gitChangesCount > 0) badge.textContent = String(gitChangesCount);

							else badge.remove();

						}

					}

					if (!hadStatus && gitStatus && gitStatus.branch !== "unknown") loadRecentCommits();

				}

const GRAPH_COLORS = ["#e2b714", "#4ec9b0", "#58a6ff", "#d2a8ff", "#ff7b72", "#79c0ff", "#7ee787", "#ffa657"];
function resetGraph() {
  graphLanes = [];
  graphPrevLanes = [];
  graphDetailOpen = "";
  graphColorInUse = new Set();
}

function allocGraphColor() {
  for (let c = 0; c < GRAPH_COLORS.length; c++) {
    if (!graphColorInUse.has(c)) { graphColorInUse.add(c); return c; }
  }
  // More active lanes than colors: wrap (rare; >8 simultaneous branches).
  return graphColorInUse.size % GRAPH_COLORS.length;
}

function freeGraphColor(c) {
  graphColorInUse.delete(c);
}

/** One graph row: vertical lanes + node + merge/branch transition lines (lane algorithm). */
function renderGraphRow(commit) {
  const laneW = 14, rowH = 20, nodeR = 3;
  const parents = commit.parents || [];
  let idx = graphLanes.findIndex((l) => l.hash === commit.hash);
  if (idx === -1) { idx = graphLanes.length; graphLanes.push({ hash: commit.hash, color: allocGraphColor() }); }
  const nodeColor = graphLanes[idx].color;

  // Build the next row's lanes now so merge fork lines can be drawn into them.
  const nextLanes = graphLanes.slice();
  nextLanes.splice(idx, 1);
  if (parents[0]) nextLanes.splice(idx, 0, { hash: parents[0], color: nodeColor });
  else freeGraphColor(nodeColor);
  const forks = [];
  for (let p = 1; p < parents.length; p++) {
    const color = allocGraphColor();
    forks.push({ hash: parents[p], color, x: (nextLanes.length + forks.length) * laneW + laneW / 2 });
  }

  const width = Math.max(laneW, (nextLanes.length + forks.length) * laneW);
  let svg = `<svg class="sol-exp-graph-svg" width="${width}" height="${rowH}">`;

  // Lane transitions from the previous row (smooth S-curves).
  graphPrevLanes.forEach((pl, pi) => {
    const ci = graphLanes.findIndex((l) => l.hash === pl.hash);
    if (ci !== -1 && ci !== pi) {
      const x1 = pi * laneW + laneW / 2, x2 = ci * laneW + laneW / 2;
      svg += `<path d="M ${x1} 0 C ${x1} ${rowH / 2}, ${x2} ${rowH / 2}, ${x2} ${rowH}" fill="none" stroke="${GRAPH_COLORS[pl.color % GRAPH_COLORS.length]}" stroke-width="2" opacity="0.7"/>`;
    }
  });

  // Vertical lanes + this commit's node.
  graphLanes.forEach((lane, i) => {
    const x = i * laneW + laneW / 2;
    const color = GRAPH_COLORS[lane.color % GRAPH_COLORS.length];
    if (i === idx) {
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${rowH / 2 - nodeR}" stroke="${color}" stroke-width="2"/>`;
      // Unpushed (local-only) commits: hollow node in the theme's primary label
      // color (auto light/dark); pushed commits: solid lane color.
      if (commit.unpushed) svg += `<circle cx="${x}" cy="${rowH / 2}" r="${nodeR + 1}" fill="none" stroke="var(--dsw-alias-label-primary,#d4d4d4)" stroke-width="2.5"/>`;
      else svg += `<circle cx="${x}" cy="${rowH / 2}" r="${nodeR}" fill="${color}"/>`;
      if (parents[0]) svg += `<line x1="${x}" y1="${rowH / 2 + nodeR}" x2="${x}" y2="${rowH}" stroke="${color}" stroke-width="2"/>`;
      // Merge fork lines down to each additional parent's new lane.
      for (const f of forks) {
        svg += `<line x1="${x}" y1="${rowH / 2 + nodeR}" x2="${f.x}" y2="${rowH}" stroke="${GRAPH_COLORS[f.color % GRAPH_COLORS.length]}" stroke-width="2"/>`;
      }
    } else {
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${rowH}" stroke="${color}" stroke-width="2" opacity="0.55"/>`;
    }
  });

  svg += `</svg>`;
  graphPrevLanes = graphLanes.slice();
  graphLanes = nextLanes;
  for (const f of forks) graphLanes.push({ hash: f.hash, color: f.color });
  return svg;
}
// ── Commit detail cache (shared by inline expansion & tooltip) ──────────

async function getCommitDetail(hash) {
  if (commitDetailCache.has(hash)) return commitDetailCache.get(hash);
  const result = await (await fetch(`/solution-explorer/git-commit-detail?root=${encodeURIComponent(gitRoot())}&hash=${encodeURIComponent(hash)}`)).json();
  if (!result.ok || !result.value) throw new Error(result.error?.message || "加载失败");
  commitDetailCache.set(hash, result.value);
  return result.value;
}

// ── Inline changed-file list (expanded below a clicked commit row) ─────

function commitDetailInlineHTML(c) {
  const zh = document.documentElement.lang?.startsWith("zh");
  const files = (c.files || []).slice(0, 200).map((f) => {
    const cls = gitStatusClass(f.status);
    const label = f.oldPath ? `${f.oldPath} → ${f.path}` : f.path;
    return `<div class="sol-exp-commit-file-row" title="${escapeHtml(label)}"><span class="sol-exp-commit-file-icon">${fileIcon(f.path)}</span><span class="sol-exp-commit-file-path">${escapeHtml(label)}</span><span class="sol-exp-commit-file-status sol-exp-git-${cls}">${f.status}</span></div>`;
  }).join("");
  return `${files || `<div class="sol-exp-commit-file-row" style="color:var(--dsw-alias-label-tertiary,#6e6e6e)">${zh ? "（无文件信息，合并提交不列出文件）" : "(no file list — merge commit)"}</div>`}
  <div class="sol-exp-commit-detail-footer"><button class="sol-exp-commit-detail-btn" onclick="window.__solExpCommitCheckout('${c.hash}')">Checkout</button></div>`;
}

function ensureCommitDetailInline(hash, c) {
  const list = document.getElementById("sol-exp-commits-list");
  if (!list) return;
  // Remove any stale inline block before inserting the new one.
  list.querySelectorAll(".sol-exp-commit-detail-inline").forEach((el) => el.remove());
  if (!hash) return;
  const row = list.querySelector(`.sol-exp-commit-item[data-hash="${hash}"]`);
  if (!row) return;
  const block = document.createElement("div");
  block.className = "sol-exp-commit-detail-inline";
  block.setAttribute("data-hash", hash);
  block.innerHTML = c
    ? commitDetailInlineHTML(c)
    : `<div style="padding:2px 0;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${t("loading")}</div>`;
  row.insertAdjacentElement("afterend", block);
  // Ensure the expanded block is visible (the scrollable list may have
  // the block partially hidden below the fold).
  block.scrollIntoView({ block: "nearest", behavior: "instant" });
}

async function reapplyCommitDetailInline() {
  const hash = graphDetailOpen;
  if (!hash) return;
  const list = document.getElementById("sol-exp-commits-list");
  if (!list || !list.querySelector(`.sol-exp-commit-item[data-hash="${hash}"]`)) return;
  // Capture cache state BEFORE touching the DOM — a concurrent fetch
  // from __solExpCommitDetail may populate the cache between the
  // ensureCommitDetailInline call and the has() check below, which
  // would leave the loading placeholder stuck forever.
  const cached = commitDetailCache.get(hash);
  ensureCommitDetailInline(hash, cached || null);
  if (!cached) {
    try {
      const c = await getCommitDetail(hash);
      if (graphDetailOpen === hash) ensureCommitDetailInline(hash, c);
    } catch { /* row already shows loading placeholder */ }
  }
}

window.__solExpCommitDetail = async (hash) => {
  hideCommitTooltip();
  if (!hash) return;
  graphDetailOpen = graphDetailOpen === hash ? "" : hash;
  const rows = document.querySelectorAll(".sol-exp-commit-item");
  rows.forEach((r) => r.classList.toggle("selected", r.getAttribute("data-hash") === graphDetailOpen));
  if (!graphDetailOpen) { ensureCommitDetailInline("", null); return; }
  ensureCommitDetailInline(hash, null);
  try {
    const c = await getCommitDetail(hash);
    if (graphDetailOpen === hash) ensureCommitDetailInline(hash, c);
  } catch (err) {
    if (graphDetailOpen === hash) {
      const list = document.getElementById("sol-exp-commits-list");
      const block = list?.querySelector(".sol-exp-commit-detail-inline");
      if (block) block.innerHTML = `<div style="color:var(--dsw-color-error,#f48771)">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }
};

// ── Hover tooltip for commit rows ────────────────────────────────────────

async function githubCommitUrl(hash) {
  if (!remotesResolved && remotesList.length === 0) { await loadRemotes(); remotesResolved = true; }
  const r = remotesList.find((x) => x.type === "fetch" && x.name === "origin") || remotesList.find((x) => x.type === "fetch");
  if (!r) return "";
  const url = r.url || "";
  // SSH: git@github.com(-something):user/repo.git
  // HTTPS: https://github.com/user/repo.git
  let m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/) || url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m || !/^github\.com/.test(m[1])) return "";
  return `https://github.com/${m[2]}/commit/${hash}`;
}

function commitTooltipHTML(c) {
  const zh = document.documentElement.lang?.startsWith("zh");
  const body = (c.body || c.message || "").trim();
  const s = c.stats || { files: 0, insertions: 0, deletions: 0 };
  let statsText = "";
  if (c.files && c.files.length) {
    statsText = zh
      ? `已更改 ${s.files} 个文件`
      : `${s.files} file${s.files === 1 ? "" : "s"} changed`;
    if (s.insertions) statsText += zh ? `，${s.insertions} 行插入(+)` : `, ${s.insertions} insertion${s.insertions === 1 ? "" : "s"}(+)`;
    if (s.deletions) statsText += zh ? `，${s.deletions} 行删除(-)` : `, ${s.deletions} deletion${s.deletions === 1 ? "" : "s"}(-)`;
  }
  const date = new Date(c.timestamp).toLocaleString();
  const link = githubCommitUrl(c.hash);
  return `
    <div class="sol-exp-commit-tip-msg">${escapeHtml(body)}</div>
    ${statsText ? `<div class="sol-exp-commit-tip-stats">${statsText}</div>` : ""}
    <div class="sol-exp-commit-tip-meta">${escapeHtml(c.author)} &lt;${escapeHtml(c.email)}&gt; · ${date}</div>
    <div class="sol-exp-commit-tip-hash"><span class="sol-exp-commit-hash">${c.shortHash}</span>${link ? ` <a class="sol-exp-commit-tip-link" href="${link}" target="_blank" rel="noreferrer">↗ ${zh ? "在 GitHub 上打开" : "Open on GitHub"}</a>` : ""}</div>`;
}

function buildCommitTooltip() {
  if (commitTipEl) return;
  commitTipEl = document.createElement("div");
  commitTipEl.className = "sol-exp-commit-tooltip";
  commitTipEl.style.display = "none";
  document.body.appendChild(commitTipEl);
}

function positionCommitTooltip(row) {
  const el = commitTipEl;
  if (!el || !row) return;
  el.style.visibility = "hidden";
  el.style.display = "block";
  el.style.maxWidth = "340px";
  const tw = el.offsetWidth, th = el.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = 8;
  const rect = row.getBoundingClientRect();
  let x: number, y: number;
  // Prefer left of the row (not blocking the records below).
  if (rect.left - tw - 6 >= margin) {
    x = rect.left - tw - 6;
    y = rect.top;
  } else if (rect.right + 6 + tw <= vw - margin) {
    x = rect.right + 6;
    y = rect.top;
  } else {
    // Fallback: below the row.
    x = Math.min(Math.max(margin, rect.left), vw - tw - margin);
    y = rect.bottom + 6;
  }
  // Clamp vertically.
  if (y + th > vh - margin) y = Math.max(margin, rect.top - th - 6);
  if (y < margin) y = margin;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.visibility = "visible";
}

function hideCommitTooltip() {
  if (commitTipShowTimer) { clearTimeout(commitTipShowTimer); commitTipShowTimer = 0; }
  if (commitTipHideTimer) { clearTimeout(commitTipHideTimer); commitTipHideTimer = 0; }
  commitTipHash = "";
  commitTipPending = "";
  if (commitTipEl) commitTipEl.style.display = "none";
}

function scheduleHideCommitTooltip() {
  if (commitTipHideTimer) clearTimeout(commitTipHideTimer);
  commitTipHideTimer = setTimeout(hideCommitTooltip, 200);
}

function cancelHideCommitTooltip() {
  if (commitTipHideTimer) { clearTimeout(commitTipHideTimer); commitTipHideTimer = 0; }
}

async function showCommitTooltip(row, hash) {
  commitTipHash = hash;
  buildCommitTooltip();
  try {
    const c = await getCommitDetail(hash);
    if (commitTipHash !== hash) return;
    commitTipEl!.innerHTML = commitTooltipHTML(c);
    // Resolve the GitHub link promise to fill in the real URL.
    githubCommitUrl(hash).then((link) => {
      if (commitTipHash !== hash || !commitTipEl) return;
      const linkEl = commitTipEl.querySelector(".sol-exp-commit-tip-link");
      if (linkEl && link) linkEl.setAttribute("href", link);
      else if (linkEl && !link) linkEl.remove();
    });
    positionCommitTooltip(row);
  } catch {
    if (commitTipHash !== hash) return;
    commitTipEl!.innerHTML = `<div style="color:var(--dsw-alias-label-secondary,#969696)">${t("loading")}</div>`;
    positionCommitTooltip(row);
  }
}
window.__solExpCommitCheckout = async (hash) => {
  if (!hash) return;
  const zh = document.documentElement.lang?.startsWith("zh");
  const ok = await showConfirm({ title: "Checkout", okText: "Checkout", message: zh ? `Checkout 到 ${hash.substring(0, 8)}？\n注意：将进入 detached HEAD 状态（不在任何分支上）。` : `Checkout ${hash.substring(0, 8)}?\nNote: this enters a detached HEAD state.` });
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
  if (!(await showConfirm({ title: t("scm.init.button"), message: t("scm.init.confirm"), okText: t("scm.init.button") }))) return;
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
  if (!(await showConfirm({ title: t("scm.sync.pull"), message: t("scm.sync.pullConfirm"), okText: t("scm.sync.pull") }))) return;
  const result = await (await fetch("/solution-explorer/git-pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) showToast(result.error?.message || "拉取失败", true);
  else {
    await loadGitStatus(); await loadRecentCommits();
    const out = (result.value || "").trim();
    showToast(out ? t("scm.sync.pull") + ":\n" + out : t("scm.sync.upToDate"));
  }
};
window.__solExpPush = async () => {
  if (!(await showConfirm({ title: t("scm.sync.push"), message: t("scm.sync.pushConfirm"), okText: t("scm.sync.push") }))) return;
  const result = await (await fetch("/solution-explorer/git-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot() }) })).json();
  if (!result.ok) showToast(result.error?.message || "推送失败", true);
  else {
    await loadGitStatus();
    const out = (result.value || "").trim();
    showToast(out ? t("scm.sync.push") + ":\n" + out : t("scm.sync.done"));
  }
};
window.__solExpSync = async () => {
  if (!(await showConfirm({ title: t("scm.sync.sync"), message: t("scm.sync.syncConfirm"), okText: t("scm.sync.sync") }))) return;
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
  if (!(await showConfirm({ title: t("scm.remote.title"), message: t("scm.remote.removeConfirm").replace("{name}", name), okText: t("scm.remote.remove"), danger: true }))) return;
  const result = await (await fetch("/solution-explorer/git-remote-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  if (!result.ok) alert(result.error?.message || "删除远程失败"); else { await loadRemotes(); render(); }
};
window.__solExpRemoteSetUrl = async (name) => {
  const url = await showPrompt({ title: t("scm.remote.title"), message: "新的 URL（" + name + "）", placeholder: "https://… 或 git@…" });
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
  if (!(await showConfirm({ title: t("scm.branch.title"), message: t("scm.branch.deleteConfirm").replace("{name}", name), okText: t("scm.branch.delete"), danger: true }))) return;
  let result = await (await fetch("/solution-explorer/git-branch-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  // Safe delete (-d) refuses unmerged branches — offer a forced delete (-D).
  if (!result.ok && String(result.error?.message || "").includes("not fully merged")) {
    const zh = document.documentElement.lang?.startsWith("zh");
    const ok = await showConfirm({ title: t("scm.branch.title"), message: zh ? "该分支有未合并的提交，确定强制删除？此操作不可撤销。" : "This branch has unmerged commits. Force delete? This cannot be undone.", okText: zh ? "强制删除" : "Force delete", danger: true });
    if (!ok) return;
    result = await (await fetch("/solution-explorer/git-branch-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name, force: true }) })).json();
  }
  if (!result.ok) showToast(result.error?.message || "删除失败", true); else { await loadBranches(); render(); }
};
window.__solExpBranchRename = async (name) => {
  const newName = await showPrompt({ title: t("scm.branch.title"), message: t("scm.branch.newName") + " (" + name + ")", placeholder: name });
  if (!newName || !newName.trim()) return;
  const result = await (await fetch("/solution-explorer/git-branch-rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), oldName: name, newName: newName.trim() }) })).json();
  if (!result.ok) alert(result.error?.message || "重命名失败"); else { await loadBranches(); render(); }
};
window.__solExpBranchMerge = async (name) => {
  if (!(await showConfirm({ title: t("scm.branch.title"), message: t("scm.branch.mergeConfirm").replace("{name}", name), okText: t("scm.branch.merge") }))) return;
  const result = await (await fetch("/solution-explorer/git-branch-merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  if (!result.ok) alert(result.error?.message || "合并失败"); else { await loadGitStatus(); await loadRecentCommits(); }
};
window.__solExpBranchPublish = async (name) => {
  if (!(await showConfirm({ title: t("scm.branch.title"), message: t("scm.branch.publishConfirm").replace("{name}", name), okText: t("scm.branch.publish") }))) return;
  const result = await (await fetch("/solution-explorer/git-branch-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root: gitRoot(), name }) })).json();
  if (!result.ok) alert(result.error?.message || "发布失败"); else await loadBranches();
};
function commitsListHTML() {
					if (commitsHTML === null) return "Loading...";
					if (commitsHTML === "") return t("scm.log.empty");
					return commitsHTML;
				}
				async function loadRecentCommits() {
					console.log("[sol-exp] loadRecentCommits", Date.now());
					if (!root || !gitStatus || gitStatus.branch === "unknown") return;
					// Bump the generation so a git-log fetch still in flight for
					// the previous repo/branch is discarded when it lands.
					commitsSeq++;
					commitsPage = 0;
					commitsAllLoaded = false;
					// Drop the cached list: the reload shows the loading
					// placeholder until fresh commits arrive. render() reads from
					// commitsHTML, so a late render can never wipe a filled list
					// back to "Loading…".
					commitsHTML = null;
					// Release the in-flight guard — the fetch it protects is stale
					// now and its response will be thrown away by the seq check.
					commitsLoading = false;
					resetGraph();
					const listEl = document.getElementById("sol-exp-commits-list");
					if (listEl) listEl.innerHTML = commitsListHTML();
					await loadCommitsPage();
				}
				async function loadCommitsPage() {
					if (!root || commitsLoading || commitsAllLoaded) return;
					const seq = commitsSeq;
					commitsLoading = true;
					try {
						const url = `/solution-explorer/git-log?root=${encodeURIComponent(gitRoot())}&count=50&skip=${commitsPage * 50}`;
						const result = await (await fetch(url)).json();
						// A newer load took over while this fetch was in flight
						// (conversation/repo switch, refresh) — discard the stale
						// response instead of writing it into the current list.
						if (seq !== commitsSeq) return;
						console.log("[sol-exp] loadCommitsPage ok", result.ok, result.value ? result.value.length : -1, "el", !!document.getElementById("sol-exp-commits-list"));
						if (result.ok && result.value) {
							const commitsList = document.getElementById("sol-exp-commits-list");
							if (commitsList) {
								if (commitsPage === 0 && result.value.length === 0) {
									commitsList.textContent = t("scm.log.empty");
									commitsHTML = "";
									commitsAllLoaded = true;
								} else {
									const items = result.value.map((commit) => {
										const graph = renderGraphRow(commit);
										const selected = graphDetailOpen === commit.hash ? " selected" : "";
										return `<div class="sol-exp-commit-item${selected}" data-hash="${commit.hash}" onclick="window.__solExpCommitDetail('${commit.hash}')"><span class="sol-exp-graph">${graph}</span><span class="sol-exp-commit-hash">${commit.shortHash}</span><span class="sol-exp-commit-msg">${escapeHtml(commit.message.substring(0, 60))}${commit.message.length > 60 ? "..." : ""}</span><span class="sol-exp-commit-date">${relTime(commit.timestamp)}</span></div>`;
									}).join("");
									if (commitsPage === 0) commitsList.innerHTML = items;
									else commitsList.insertAdjacentHTML("beforeend", items);
									commitsHTML = commitsPage === 0 ? items : (commitsHTML || "") + items;
									commitsPage++;
									if (result.value.length < 50) commitsAllLoaded = true;
								}
							}
						}
					} catch (err) {
						if (seq === commitsSeq) console.error("Failed to load commits:", err);
					} finally {
						// Only the current generation may release the in-flight
						// guard; a stale fetch must not clear a newer one's flag.
						if (seq === commitsSeq) commitsLoading = false;
					}
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

					console.log("[sol-exp] doCommit -> loadRecentCommits", Date.now());

					await loadRecentCommits();

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

            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M6 5C6 4.44772 6.44772 4 7 4C7.55228 4 8 4.44772 8 5C8 5.55228 7.55228 6 7 6C6.44772 6 6 5.55228 6 5ZM8 7.82929C9.16519 7.41746 10 6.30622 10 5C10 3.34315 8.65685 2 7 2C5.34315 2 4 3.34315 4 5C4 6.30622 4.83481 7.41746 6 7.82929V16.1707C4.83481 16.5825 4 17.6938 4 19C4 20.6569 5.34315 22 7 22C8.65685 22 10 20.6569 10 19C10 17.7334 9.21506 16.6501 8.10508 16.2101C8.45179 14.9365 9.61653 14 11 14H13C16.3137 14 19 11.3137 19 8V7.82929C20.1652 7.41746 21 6.30622 21 5C21 3.34315 19.6569 2 18 2C16.3431 2 15 3.34315 15 5C15 6.30622 15.8348 7.41746 17 7.82929V8C17 10.2091 15.2091 12 13 12H11C9.87439 12 8.83566 12.3719 8 12.9996V7.82929ZM18 6C18.5523 6 19 5.55228 19 5C19 4.44772 18.5523 4 18 4C17.4477 4 17 4.44772 17 5C17 5.55228 17.4477 6 18 6ZM6 19C6 18.4477 6.44772 18 7 18C7.55228 18 8 18.4477 8 19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19Z" fill="currentColor"/></svg>

            ${gitChangesCount > 0 ? `<span class="sol-exp-activity-badge">${gitChangesCount}</span>` : ""}

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

					if (currentTab === "scm") contentHTML = '<div class="sol-exp-scm-host" data-sol-exp-scm-host>' + buildSCMContent() + '</div>';

					else if (currentTab === "search") contentHTML = buildSearchContent();

					else contentHTML = buildExplorerContent();

					return `

        <div class="sol-exp-panel" ondragover="event.preventDefault()" ondrop="event.preventDefault();window.__solExpDrop('', event)" oncontextmenu="window.__solExpPanelContextMenu(event)">

          ${activityBarHTML}

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

                   onclick="window.__solExpSelectFile('${pathJs}', ${r.type === "directory"})"

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

				// The change-list half of the SCM panel (conflicts + commit box +
				// changes + staged). Extracted so a git-status refresh can
				// update ONLY this region, leaving the repository/commits half
				// (and its scroll/loading state) untouched.
				function buildSCMTopHTML() {

					const status = gitStatus;

					const staged = status?.staged || [];

					const unstaged = status?.unstaged || [];

					const untracked = status?.untracked || [];

					const allChanges = [...unstaged, ...untracked];

					const conflicts = status?.conflicts || [];

					let topHTML = "";

					if (conflicts.length > 0) topHTML += `

        <div class="sol-exp-scm-section${collapsedSections.has("conflicts") ? " collapsed" : ""}" data-section="conflicts">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('conflicts')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.merge.changes")}<span class="sol-exp-scm-header-actions"></span><span class="sol-exp-scm-section-count">${conflicts.length}</span></div>

          ${conflicts.map((item) => buildSCMItem(item, "conflicts")).join("")}

        </div>

      `;

					topHTML += `

        <div class="sol-exp-commit-box">

          <textarea class="sol-exp-commit-input" placeholder="${t("scm.commit.placeholder")}${status?.branch && status?.branch !== "unknown" ? " (" + status.branch + ")" : ""}" oninput="window.__solExpCommitMsg(this.value)">${escapeHtml(commitMessage)}</textarea>

          <div class="sol-exp-commit-row">

            <button class="sol-exp-commit-btn" onclick="window.__solExpCommit()" ${committing || !commitMessage.trim() ? "disabled" : ""}>${committing ? t("scm.committing") : t("scm.commit.button")}</button>

          </div>

        </div>

      `;

					topHTML += `

        <div class="sol-exp-scm-section${collapsedSections.has("changes") ? " collapsed" : ""}" data-section="changes">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('changes')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.changes")}<span class="sol-exp-scm-header-actions">

            <button class="sol-exp-hdr-btn" title="${t("scm.refresh")}" onclick="event.stopPropagation();window.__solExpRefreshSCM()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"/><path d="M13.5 3.5V7H10"/></svg></button>

            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn" title="${t("scm.stageAll")}" onclick="event.stopPropagation();window.__solExpStageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v12M2 8h12"/></svg></button>` : ""}

            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn danger" title="${t("scm.discardAll")}" onclick="event.stopPropagation();window.__solExpDiscardAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button>` : ""}

          </span><span class="sol-exp-scm-section-count">${allChanges.length}</span></div>

          ${allChanges.length === 0 ? `<div style="padding:4px 12px 8px 24px;font-size:12px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${t("scm.changes.none")}</div>` : ""}

          ${allChanges.map((item) => buildSCMItem(item, "changes")).join("")}

        </div>

      `;

					if (staged.length > 0) topHTML += `

          <div class="sol-exp-scm-section${collapsedSections.has("staged") ? " collapsed" : ""}" data-section="staged">

            <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('staged')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.staged")}<span class="sol-exp-scm-header-actions">

              <button class="sol-exp-hdr-btn" title="${t("scm.unstageAll")}" onclick="event.stopPropagation();window.__solExpUnstageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V3M3.5 7.5L8 3l4.5 4.5"/></svg></button>

            </span><span class="sol-exp-scm-section-count">${staged.length}</span></div>

            ${staged.map((item) => buildSCMItem(item, "staged")).join("")}

          </div>

        `;

					return topHTML;

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

        <div class="sol-exp-scm-section${collapsedSections.has("conflicts") ? " collapsed" : ""}" data-section="conflicts">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('conflicts')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.merge.changes")}<span class="sol-exp-scm-header-actions"></span><span class="sol-exp-scm-section-count">${conflicts.length}</span></div>

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

        <div class="sol-exp-scm-section${collapsedSections.has("changes") ? " collapsed" : ""}" data-section="changes">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('changes')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.changes")}<span class="sol-exp-scm-header-actions">

            <button class="sol-exp-hdr-btn" title="${t("scm.refresh")}" onclick="event.stopPropagation();window.__solExpRefreshSCM()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"/><path d="M13.5 3.5V7H10"/></svg></button>

            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn" title="${t("scm.stageAll")}" onclick="event.stopPropagation();window.__solExpStageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v12M2 8h12"/></svg></button>` : ""}

            ${allChanges.length > 0 ? `<button class="sol-exp-hdr-btn danger" title="${t("scm.discardAll")}" onclick="event.stopPropagation();window.__solExpDiscardAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button>` : ""}

          </span><span class="sol-exp-scm-section-count">${allChanges.length}</span></div>

          ${allChanges.length === 0 ? `<div style="padding:4px 12px 8px 24px;font-size:12px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${t("scm.changes.none")}</div>` : ""}

          ${allChanges.map((item) => buildSCMItem(item, "changes")).join("")}

        </div>

      `;

					if (staged.length > 0) topHTML += `

          <div class="sol-exp-scm-section${collapsedSections.has("staged") ? " collapsed" : ""}" data-section="staged">

            <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('staged')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.staged")}<span class="sol-exp-scm-header-actions">

              <button class="sol-exp-hdr-btn" title="${t("scm.unstageAll")}" onclick="event.stopPropagation();window.__solExpUnstageAll()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V3M3.5 7.5L8 3l4.5 4.5"/></svg></button>

            </span><span class="sol-exp-scm-section-count">${staged.length}</span></div>

            ${staged.map((item) => buildSCMItem(item, "staged")).join("")}

          </div>

        `;

					bottomHTML += `

        <div class="sol-exp-scm-section${collapsedSections.has("repository") ? " collapsed" : ""}" data-section="repository">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('repository')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.repository")}<span class="sol-exp-scm-header-actions">
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.fetch")}" onclick="event.stopPropagation();window.__solExpFetch()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v10M4 8l4 4 4-4"/></svg></button>
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.pull")}" onclick="event.stopPropagation();window.__solExpPull()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v10M4 8l4 4 4-4"/><path d="M2 14h12"/></svg></button>
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.push")}" onclick="event.stopPropagation();window.__solExpPush()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V2M4 6l4-4 4 4"/></svg></button>
            <button class="sol-exp-hdr-btn" title="${t("scm.sync.sync")}" onclick="event.stopPropagation();window.__solExpSync()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 0 1 10.47-4.02L14 5.5M14 8a6 6 0 0 1-10.47 4.02L2 10.5"/></svg></button>
          </span><span class="sol-exp-scm-section-count">${(status?.ahead || 0) > 0 || (status?.behind || 0) > 0 ? `↑${status?.ahead || 0} ↓${status?.behind || 0}` : ""}</span></div>

          <div style="padding:4px 12px 8px 24px;display:flex;flex-direction:column">

            ${repos.map((r) => `<div class="sol-exp-repo-item ${activeRepo === r.path ? "active" : ""}" data-repo-path="${r.path.replace(/"/g, "&quot;")}" onclick="window.__solExpSelectRepo('${r.path.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')"><span class="sol-exp-repo-icon">⑂</span><span class="sol-exp-repo-name">${r.name}</span><span class="sol-exp-repo-branch">${r.branch}</span><span class="sol-exp-hdr-btn" title="${t("scm.remote.title")}" onclick="event.stopPropagation();window.__solExpRemotePanel()"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-1 1"/><path d="M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l1-1"/></svg></button></span><span class="sol-exp-hdr-btn" title="${t("scm.branch.title")}" onclick="event.stopPropagation();window.__solExpBranchPanel()"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11.5" cy="7" r="1.5"/><path d="M5 5v5.5M11.5 8.5c0 2.2-1.3 3-4.2 3"/></svg></button></span></div>`).join("")}<div style="font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:6px">${t("scm.repository.branch")}</div><span class="sol-exp-branch-pill">⑂ ${status?.branch || ""}</span>

            ${remotePanelOpen ? `<div style="margin:6px 0;padding:8px;border:1px solid var(--dsw-alias-border-l2,#333);border-radius:6px;font-size:12px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b>${t("scm.remote.title")}</b><span style="flex:1"></span><button class="sol-exp-commit-detail-close" onclick="window.__solExpRemotePanel()">✕</button></div>${remotesList.length === 0 ? `<div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);padding:2px 0 6px">${t("scm.remote.none")}</div>` : remotesList.map((r) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0"><span style="flex:none;font-weight:600">${escapeHtml(r.name)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#969696)">${escapeHtml(r.url)}</span><button class="sol-exp-commit-detail-btn" onclick="window.__solExpRemoteSetUrl('${r.name.replace(/'/g, "\\'")}')">${t("scm.remote.setUrl")}</button><button class="sol-exp-commit-detail-btn" onclick="window.__solExpRemoteRemove('${r.name.replace(/'/g, "\\'")}')">${t("scm.remote.remove")}</button></div>`).join("")}<div style="display:flex;gap:6px;margin-top:8px"><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:1" placeholder="${t("scm.remote.name")}" value="${escapeHtml(remoteName)}" oninput="window.__solExpRemoteName(this.value)"/><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:2" placeholder="${t("scm.remote.url")} (https://… 或 git@…)" value="${escapeHtml(remoteUrl)}" oninput="window.__solExpRemoteUrl(this.value)"/><button class="sol-exp-commit-detail-btn" onclick="window.__solExpRemoteAdd()">${t("scm.remote.addBtn")}</button></div></div>` : ""}

            ${branchPanelOpen ? `<div style="margin:6px 0;padding:8px;border:1px solid var(--dsw-alias-border-l2,#333);border-radius:6px;font-size:12px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b>${t("scm.branch.title")}</b><span style="flex:1"></span><button class="sol-exp-commit-detail-close" onclick="window.__solExpBranchPanel()">✕</button></div><div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);margin:2px 0">${t("scm.branch.local")}</div>${branchesList.filter((b) => !b.isRemote).map((b) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer" onclick="window.__solExpBranchCheckout('${b.name.replace(/'/g, "\\'")}')"><span style="flex:none;width:14px">${b.current ? "➤" : ""}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${b.current ? "font-weight:600;color:var(--dsw-alias-label-primary)" : ""}">${escapeHtml(b.name)}</span><span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.shortHash ? b.shortHash + " " : ""}${escapeHtml((b.subject || "").substring(0, 24))}</span>${b.upstream ? `<span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e)">${escapeHtml(b.upstream)}</span>` : ""}<button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.rename")}" onclick="event.stopPropagation();window.__solExpBranchRename('${b.name.replace(/'/g, "\\'")}')">✎</button>${!b.current ? `<button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.merge")}" onclick="event.stopPropagation();window.__solExpBranchMerge('${b.name.replace(/'/g, "\\'")}')">⤵</button><button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.publish")}" onclick="event.stopPropagation();window.__solExpBranchPublish('${b.name.replace(/'/g, "\\'")}')">↑</button><button class="sol-exp-commit-detail-btn" style="padding:1px 5px" title="${t("scm.branch.delete")}" onclick="event.stopPropagation();window.__solExpBranchDelete('${b.name.replace(/'/g, "\\'")}')">✕</button>` : ""}</div>`).join("")}<div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);margin:4px 0 2px">${t("scm.branch.remote")}</div>${branchesList.filter((b) => b.isRemote).map((b) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer" onclick="window.__solExpBranchCheckout('${b.name.replace(/'/g, "\\'")}', true)"><span style="flex:none;width:14px"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#969696)">${escapeHtml(b.name)}</span><span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.shortHash ? b.shortHash + " " : ""}${escapeHtml((b.subject || "").substring(0, 24))}</span></div>`).join("")}${tagsList.length > 0 ? `<div style="color:var(--dsw-alias-label-tertiary,#6e6e6e);margin:4px 0 2px">${t("scm.branch.tags")}</div>${tagsList.map((tg) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0"><span style="flex:none;width:14px"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#969696)">${escapeHtml(tg.name)}</span><span style="flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#6e6e6e);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tg.commitHash ? escapeHtml((tg.subject || "").substring(0, 24)) : ""}</span></div>`).join("")}` : ""}<div style="display:flex;gap:6px;margin-top:8px"><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:1" placeholder="${t("scm.branch.name")}" value="${escapeHtml(branchName)}" oninput="window.__solExpBranchName(this.value)"/><input class="sol-exp-commit-input" style="min-height:0;height:26px;flex:1" placeholder="${t("scm.branch.from")}" value="${escapeHtml(branchFrom)}" oninput="window.__solExpBranchFrom(this.value)"/><button class="sol-exp-commit-detail-btn" onclick="window.__solExpBranchCreate()">${t("scm.branch.createBtn")}</button></div></div>` : ""}

          </div>

        </div>

        <div class="sol-exp-scm-section${collapsedSections.has("commits") ? " collapsed" : ""}" data-section="commits">

          <div class="sol-exp-scm-section-header" onclick="window.__solExpToggleSection('commits')"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:rotate(90deg)"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>${t("scm.repository.commits")}<span class="sol-exp-scm-header-actions"></span><span class="sol-exp-scm-section-count"></span></div>

          <div style="padding:4px 12px 8px 24px;flex:1;min-height:0;display:flex;flex-direction:column">

            <div id="sol-exp-commits-list" style="margin-top:6px;font-size:12px;color:var(--dsw-alias-label-tertiary);flex:1;min-height:0;overflow-y:auto" onscroll="window.__solExpCommitsScroll(event)">${commitsListHTML()}</div>

          </div>

        </div>

      `;

					return `<div class="sol-exp-content"><div class="sol-exp-scm-split"><div class="sol-exp-scm-top" style="flex-basis:${scmSplit}%">${topHTML}</div><div class="sol-exp-scm-divider" onpointerdown="window.__solExpScmDividerDown(event)"></div><div class="sol-exp-scm-bottom" style="flex-basis:${100 - scmSplit}%">${bottomHTML}</div></div></div>`;

				}

				function buildSCMItem(item, section) {

					const pathJs = item.path.replace(/'/g, "\\'");

					const action = section === "staged" ? `<button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpUnstage(['${pathJs}'])" title="${t("scm.unstage")}">◦</button>` : section === "conflicts" ? `<button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpStage(['${pathJs}'])" title="标记为已解决">✓</button>` : `<button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpStage(['${pathJs}'])" title="${t("scm.stage")}">+</button>

           <button class="sol-exp-scm-action-btn" onclick="event.stopPropagation();window.__solExpDiscard(['${pathJs}'])" title="${t("scm.discard")}">✕</button>`;

					const staged = section === "staged";

					// A trailing slash marks an untracked directory entry (a folder
					// whose contents are all ignored) — reveal it in the tree.
					const isDir = item.path.endsWith("/") || item.path.endsWith("\\");

					// Images open in the editor's image preview (same as the file
					// tree); everything else opens the diff view.
					const openJs = isDir ? `window.__solExpSelectFile('${pathJs}', true)` : isImageFile(item.path) ? `window.__solExpOpenFile('${pathJs}')` : `window.__solExpOpenDiff('${pathJs}', ${staged})`;

					return `

        <div class="sol-exp-scm-item" title="${t("file.open")}" onclick="${openJs}">

          <span class="sol-exp-file-icon">${isDir ? folderIcon(false) : fileIcon(item.path)}</span>

          <span class="sol-exp-scm-path">${escapeHtml(item.path)}</span>

          <span class="sol-exp-scm-actions">${action}</span>

        </div>

      `;

				}

				// ─── File-type icons (VS Code style, inline SVG) ────────────────
				// Type colors are content colors (like diff +/- and git status hues),
				// intentionally fixed for cross-theme recognition. Badges are white
				// strokes on the colored file outline.

				function renderTreeNode(node, depth) {

					if (!node) return "";

					const isDir = node.type === "directory";

					const isExpanded = expandedPaths.has(node.path);

					const isSelected = selectedPaths.has(node.path);

					const isCut = clipboard?.mode === "cut" && clipboard.paths.includes(node.path);

					const isDropTarget = isDir && dropTargetPath === node.path && dragPaths.length > 0;

					const hasChildren = isDir && node.children && node.children.length > 0;

					const padding = 12 + depth * 16;

					// Map git status letters to stable shared class suffixes.
					const gitCls = node.gitStatus ? gitStatusClass(node.gitStatus) : "";

					const pathJs = node.path.replace(/'/g, "\\'").replace(/\\/g, "\\\\");

					const chevron = isDir ? hasChildren ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style="transform:${isExpanded ? "rotate(90deg)" : "rotate(0deg)"};transition:transform .15s ease"><path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"/></svg>` : "<span style=\"width:16px;display:inline-block\"></span>" : "<span style=\"width:16px;display:inline-block\"></span>";

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

            ${node.path === renamingPath
              ? `<input class="sol-exp-rename-input" data-sol-exp-rename="1" value="${escapeHtml(node.name)}" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')window.__solExpRenameCommit(this.value);else if(event.key==='Escape')window.__solExpRenameCancel()" onblur="window.__solExpRenameCommit(this.value)" />`
              : `<span class="sol-exp-file-name${gitCls ? " sol-exp-git-" + gitCls : ""}">${escapeHtml(node.name)}</span>`}

            ${node.gitStatus ? `<span class="sol-exp-git-letter sol-exp-git-${gitCls}">${node.gitStatus}</span>` : ""}

          </div>

          ${childrenHTML}

        </div>

      `;

				}

				// Incremental tree update: reconcile the existing tree DOM against
				// a new tree, patching only the nodes that changed (keyed by
				// data-sol-exp-path). Unchanged nodes keep their DOM, so the
				// expanded state and scroll position survive and nothing flashes.
				function reconcileTree(container, nodes, depth) {

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
							tmp.innerHTML = renderTreeNode(node, depth);

							const newRow = tmp.querySelector(".sol-exp-tree-node");

							const oldRow = wrapper.querySelector(".sol-exp-tree-node");

							if (newRow && oldRow && newRow.outerHTML !== oldRow.outerHTML) oldRow.replaceWith(newRow);

							const isDir = node.type === "directory";

							if (isDir && expandedPaths.has(node.path)) {

								const childBox = wrapper.querySelector(".sol-exp-tree-children");

								if (childBox && node.children) reconcileTree(childBox, node.children, depth + 1);

							}

						} else {

							// New node: build its wrapper and insert it before
							// the next existing sibling (keeps order stable).
							tmp.innerHTML = renderTreeNode(node, depth);

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

				let searchTimer;

				window.__solExpTab = (tab) => {

					currentTab = tab;

					render();

					if (tab === "scm") {

						// Reload status and commit history when the SCM tab
						// opens — the commit list is only populated here and
						// on explicit refresh, never by background polling.
						loadGitStatus();

						loadRecentCommits();

					}

				};

				// A rail feature icon expands the column back and opens that
				// tab in one click (the rail itself has no body to render).
				window.__solExpRailOpen = (tab) => {

					panelCollapsed = false;

					window.__solExpTab(tab);

					applyGrid();

				};

				window.__solExpToggleExpand = (path) => {

					if (expandedPaths.has(path)) expandedPaths.delete(path);

					else expandedPaths.add(path);

					render();

				};

				window.__solExpSelectFile = async (path, isDir) => {

					if (isDir) {

						// Directories reveal in the tree (expand ancestors + select)
						// instead of being opened as files — consistent with the tree.
						const parts = path.split("/").filter(Boolean);

						let acc = "";

						for (let i = 0; i < parts.length - 1; i++) {

							acc = acc ? acc + "/" + parts[i] : parts[i];

							expandedPaths.add(acc);

						}

						selectedPaths = /* @__PURE__ */ new Set([path]);

						selectedPath = null;

						render();

						return;

					}

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

					const zh = document.documentElement.lang?.startsWith("zh");
					const name = await showPrompt({
						title: type === "file" ? (zh ? "新建文件" : "New file") : (zh ? "新建文件夹" : "New folder"),
						message: type === "file" ? (zh ? "输入文件名" : "Enter file name") : (zh ? "输入文件夹名" : "Enter folder name")
					});

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

					// Refresh without the loading flash once a tree exists:
					// reconcile in place; only the very first load falls back
					// to the full loading path.
					if (treeState) refreshTreeSilent();

					else loadTree();

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

					// Silent refresh: re-render only the SCM region, no flash.
					loadGitStatus();

					loadRecentCommits();

				};

				window.__solExpCommitMsg = (msg) => {

					commitMessage = msg;

					// Toggle the commit button in place: a full render() resets the
					// async-loaded commit history and the textarea caret on every keystroke.
					document.querySelectorAll(".sol-exp-commit-btn").forEach((btn) => {
						if (committing || !commitMessage.trim()) btn.setAttribute("disabled", "disabled");
						else btn.removeAttribute("disabled");
					});

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

				window.__solExpDiscardAll = async () => {

					const all = [...gitStatus?.unstaged || [], ...gitStatus?.untracked || []].map((i) => i.path);

					if (all.length && (await showConfirm({ title: t("scm.changes"), message: t("scm.discardAllConfirm"), okText: document.documentElement.lang?.startsWith("zh") ? "放弃" : "Discard", danger: true }))) doDiscard(all);

				};

				let contextMenuEl = null;

				function hideContextMenu() {

					if (contextMenuEl) {

						contextMenuEl.remove();

						contextMenuEl = null;

					}

				}

				document.addEventListener("click", hideContextMenu);

				// ── Commit-row hover tooltip (event delegation) ─────────────
				document.addEventListener("mouseover", (e) => {
					const target = e.target;
					if (!(target instanceof Element)) return;
					// Hovering the tooltip itself keeps it alive.
					if (target.closest(".sol-exp-commit-tooltip")) { cancelHideCommitTooltip(); return; }
					const row = target.closest(".sol-exp-commit-item");
					if (row && row.closest("#sol-exp-commits-list")) {
						cancelHideCommitTooltip();
						const hash = row.getAttribute("data-hash") || "";
						if (hash && hash !== commitTipPending) {
							if (commitTipShowTimer) clearTimeout(commitTipShowTimer);
							commitTipPending = hash;
							commitTipShowTimer = setTimeout(() => {
								commitTipShowTimer = 0;
								if (commitTipPending === hash) showCommitTooltip(row, hash);
							}, 350);
						}
						return;
					}
					scheduleHideCommitTooltip();
				});
				document.addEventListener("mouseout", (e) => {
					const target = e.target;
					if (!(target instanceof Element)) return;
					const row = target.closest(".sol-exp-commit-item");
					if (row && !row.contains(e.relatedTarget as Node)) scheduleHideCommitTooltip();
				});
				// Hide tooltip on any scroll (row position is stale after scroll).
				document.addEventListener("scroll", hideCommitTooltip, true);

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

						if (targets.length === 1) addItem("重命名", false, () => window.__solExpRename(targets[0]));

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

				window.__solExpRename = (path) => {

					renamingPath = path;

					render();

					const input = activeEl ? activeEl.querySelector("[data-sol-exp-rename]") : null;

					if (input) { input.focus(); input.select(); }

				};

				window.__solExpRenameCancel = () => {

					if (!renamingPath) return;

					renamingPath = "";

					render();

				};

				window.__solExpRenameCommit = async (name) => {

					const path = renamingPath;

					if (!path) return;

					renamingPath = "";

					const newName = String(name || "").trim();

					const oldName = path.split(/[\\/]/).pop() || "";

					if (!newName || newName === oldName) { render(); return; }

					try {

						const result = await (await fetch("/solution-explorer/rename", {

							method: "POST",

							headers: { "Content-Type": "application/json" },

							body: JSON.stringify({ root, source: path, newName }),

						})).json();

						if (result.ok) {

							if (treeState) refreshTreeSilent();

							else loadTree();

							loadGitStatus();

						} else {

							showToast(result.error?.message || "重命名失败", true);

							render();

						}

					} catch (err) {

						showToast(String((err && err.message) || err), true);

						render();

					}

				};

				window.__solExpDeletePaths = async (paths) => {

					if (!root || !paths.length) return;

					const zh = document.documentElement.lang?.startsWith("zh");
					if (!(await showConfirm({ title: zh ? "删除" : "Delete", message: zh ? "确定删除 " + paths.length + " 项？" : "Delete " + paths.length + " item(s)?", okText: zh ? "删除" : "Delete", danger: true }))) return;

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

					// If the editor is showing a deleted file, close it so the
					// stale preview (an image especially) cannot linger.
					if (editorStore.file && paths.includes(editorStore.file)) {

						editorStore.file = null;

						editorStore.content = null;

						editorStore.loading = false;

						editorStore.error = null;

						editorStore.unsupported = false;

						editorStore.image = false;

						editorStore.saving = false;

						editorStore.root = "";

						notifyEditorListeners();

					}

					if (failed) alert(failed + " 项删除失败");

					// Silent refresh: reconcile the tree in place and update
					// SCM state — no loading flash, no full-panel rebuild.
					if (treeState) refreshTreeSilent();

					else loadTree();

					loadGitStatus();

				};

				window.__solExpDeleteFile = async (target) => {

					if (target) await window.__solExpDeletePaths([target]);

				};

				window.__solExpToggleSection = (id) => {

					// Query inside the active panel: a global query could hit a
					// stale or duplicate SCM region after session/repo switches,
					// leaving the visible section stuck open.
					const scope = activeEl ?? document;

					const el = scope.querySelector(`[data-section="${id}"]`);

					if (el) {

						if (el.classList.contains("collapsed")) {

							el.classList.remove("collapsed");

							collapsedSections.delete(id);

						} else {

							el.classList.add("collapsed");

							collapsedSections.add(id);

						}

					}

				};

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
				scmDragging = true;
				// Query inside the active panel: global queries could hit a stale
				// or duplicate SCM region after session/repo switches.
				const scope = activeEl ?? document;
				const split = scope.querySelector(".sol-exp-scm-split");
				const top = scope.querySelector(".sol-exp-scm-top") as HTMLElement;
				const bottom = scope.querySelector(".sol-exp-scm-bottom") as HTMLElement;
				if (!split || !top || !bottom) { scmDragging = false; return; }
				const el = e.currentTarget as HTMLElement;
				try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
				const rect = split.getBoundingClientRect();
				// Guard against a zero-height split (collapsed region): fall back
				// to the panel height so the ratio never becomes NaN.
				const height = rect.height > 0 ? rect.height : (split.parentElement?.getBoundingClientRect().height ?? 300) || 300;
				const startY = e.clientY;
				const startSplit = scmSplit;
				const onMove = (me) => {
				const dy = me.clientY - startY;
				// Re-measure each move: right after startup the split may still be
				// settling, and a stale tiny height would blow up the ratio.
				const curRect = split.getBoundingClientRect();
				const h = curRect.height > 200 ? curRect.height : height;
				const target = Math.min(85, Math.max(15, startSplit + (dy / h) * 100));
				// Clamp the per-move delta so one bad measurement cannot jump the
				// divider far down/up — the ratio only ever moves by <= 8% per move.
				const next = Math.min(Math.max(target, scmSplit - 8), scmSplit + 8);
				if (next === scmSplit) return;
				scmSplit = next;
				// Re-query each move so a refresh replacing the SCM region
				// mid-drag cannot invalidate the element references.
				const t = scope.querySelector(".sol-exp-scm-top") as HTMLElement | null;
				const b = scope.querySelector(".sol-exp-scm-bottom") as HTMLElement | null;
				if (t) t.style.flexBasis = scmSplit + "%";
				if (b) b.style.flexBasis = (100 - scmSplit) + "%";
				};
				const onUp = () => {
				scmDragging = false;
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
							if (root !== "") loadTree();
						}
					}).catch(() => {});
				};
				applySettings();
				window.addEventListener("sol-exp-settings-saved", applySettings);
				let scmSplit = 55;

				let scmDragging = false;

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

					treeState = null;

					gitStatus = null;

					gitChangesCount = 0;

					// Invalidate any in-flight commits fetch from the previous
					// conversation and drop the cached list so the new repo's
					// history starts from the loading placeholder.
					commitsSeq++;

					commitsHTML = null;

					commitsPage = 0;

					commitsAllLoaded = false;

					commitsLoading = false;
					commitDetailCache.clear();
					remotesResolved = false;

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

				// Auto-refresh the visible tab in place (incremental reconcile —
				// no loading flash): the file tree or the SCM region, whichever
				// is on screen, patched locally every few seconds.
				const autoRefreshTimer = setInterval(() => {

					if (root === "" || document.visibilityState !== "visible" || scmDragging) return;

					if (currentTab === "scm") loadGitStatus();

					else if (currentTab === "explorer") refreshTreeSilent();

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

						else { await loadGitStatus(); await loadTree(); }

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

				return () => {

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

					document.removeEventListener("click", hideContextMenu);

					document.removeEventListener("dragenter", dragGuard);

					document.removeEventListener("dragover", dragGuard);

					document.removeEventListener("drop", dragGuard);

					window.removeEventListener("sol-exp-settings-saved", applySettings);

					clearInterval(autoRefreshTimer);

				};

			}, "dsh-solution-explorer: wiring");
}
