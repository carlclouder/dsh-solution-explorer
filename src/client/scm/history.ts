/**
 * Commit history & detail/tooltip — SCM domain.
 * Loaders receive deps = { state, loadRemotes } injected from panel.ts.
 * @module dsh-solution-explorer/client/scm/history
 */

import { t } from "../locales.ts"

import { escapeHtml, relTime } from "../shared/dom.ts"

import { fileIcon, gitStatusClass } from "../explorer/icons.ts"

import { gitRoot, type AppState } from "../state/store.ts"

import { resetGraph, commitsListHTML, renderGraphRow } from "./graph.ts"

export interface HistoryDeps {
  state: AppState
  loadRemotes?: (deps?: any) => Promise<void>
}

export async function getCommitDetail(hash: string, { state }: HistoryDeps) {
  if (state.commits.commitDetailCache.has(hash)) return state.commits.commitDetailCache.get(hash);
  const result = await (await fetch(`/solution-explorer/git-commit-detail?root=${encodeURIComponent(gitRoot(state))}&hash=${encodeURIComponent(hash)}`)).json();
  if (!result.ok || !result.value) throw new Error(result.error?.message || "加载失败");
  state.commits.commitDetailCache.set(hash, result.value);
  return result.value;
}

export function commitDetailInlineHTML(c: any): string {
  const zh = document.documentElement.lang?.startsWith("zh");
  const files = (c.files || []).slice(0, 200).map((f: any) => {
    const cls = gitStatusClass(f.status);
    const label = f.oldPath ? `${f.oldPath} → ${f.path}` : f.path;
    return `<div class="sol-exp-commit-file-row" title="${escapeHtml(label)}"><span class="sol-exp-commit-file-icon">${fileIcon(f.path)}</span><span class="sol-exp-commit-file-path">${escapeHtml(label)}</span><span class="sol-exp-commit-file-status sol-exp-git-${cls}">${f.status}</span></div>`;
  }).join("");
  return `${files || `<div class="sol-exp-commit-file-row" style="color:var(--dsw-alias-label-tertiary,#6e6e6e)">${zh ? "（无文件信息，合并提交不列出文件）" : "(no file list — merge commit)"}</div>`}
  <div class="sol-exp-commit-detail-footer"><button class="sol-exp-commit-detail-btn" onclick="window.__solExpCommitCheckout('${c.hash}')">Checkout</button></div>`;
}

export function ensureCommitDetailInline(hash: string, c: any) {
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

export async function reapplyCommitDetailInline({ state }: HistoryDeps) {
  const hash = state.commits.graphDetailOpen;
  if (!hash) return;
  const list = document.getElementById("sol-exp-commits-list");
  if (!list || !list.querySelector(`.sol-exp-commit-item[data-hash="${hash}"]`)) return;
  // Capture cache state BEFORE touching the DOM — a concurrent fetch
  // from __solExpCommitDetail may populate the cache between the
  // ensureCommitDetailInline call and the has() check below, which
  // would leave the loading placeholder stuck forever.
  const cached = state.commits.commitDetailCache.get(hash);
  ensureCommitDetailInline(hash, cached || null);
  if (!cached) {
    try {
      const c = await getCommitDetail(hash, { state });
      if (state.commits.graphDetailOpen === hash) ensureCommitDetailInline(hash, c);
    } catch { /* row already shows loading placeholder */ }
  }
}

export async function githubCommitUrl(hash: string, { state, loadRemotes }: HistoryDeps) {
  if (!state.commits.remotesResolved && state.scm.remotesList.length === 0) { await loadRemotes?.({ state }); state.commits.remotesResolved = true; }
  const r = state.scm.remotesList.find((x) => x.type === "fetch" && x.name === "origin") || state.scm.remotesList.find((x) => x.type === "fetch");
  if (!r) return "";
  const url = r.url || "";
  // SSH: git@github.com(-something):user/repo.git
  // HTTPS: https://github.com/user/repo.git
  let m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/) || url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m || !/^github\.com/.test(m[1])) return "";
  return `https://github.com/${m[2]}/commit/${hash}`;
}

export function commitTooltipHTML(c: any, deps: HistoryDeps): string {
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
  const link = githubCommitUrl(c.hash, deps);
  return `
    <div class="sol-exp-commit-tip-msg">${escapeHtml(body)}</div>
    ${statsText ? `<div class="sol-exp-commit-tip-stats">${statsText}</div>` : ""}
    <div class="sol-exp-commit-tip-meta">${escapeHtml(c.author)} &lt;${escapeHtml(c.email)}&gt; · ${date}</div>
    <div class="sol-exp-commit-tip-hash"><span class="sol-exp-commit-hash">${c.shortHash}</span>${link ? ` <a class="sol-exp-commit-tip-link" href="${link}" target="_blank" rel="noreferrer">↗ ${zh ? "在 GitHub 上打开" : "Open on GitHub"}</a>` : ""}</div>`;
}

export function buildCommitTooltip({ state }: HistoryDeps) {
  if (state.commits.commitTipEl) return;
  state.commits.commitTipEl = document.createElement("div");
  state.commits.commitTipEl.className = "sol-exp-commit-tooltip";
  state.commits.commitTipEl.style.display = "none";
  document.body.appendChild(state.commits.commitTipEl);
}

export function positionCommitTooltip(row: any, { state }: HistoryDeps) {
  const el = state.commits.commitTipEl;
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

export function hideCommitTooltip({ state }: HistoryDeps) {
  if (state.commits.commitTipShowTimer) { clearTimeout(state.commits.commitTipShowTimer); state.commits.commitTipShowTimer = 0; }
  if (state.commits.commitTipHideTimer) { clearTimeout(state.commits.commitTipHideTimer); state.commits.commitTipHideTimer = 0; }
  state.commits.commitTipHash = "";
  state.commits.commitTipPending = "";
  if (state.commits.commitTipEl) state.commits.commitTipEl.style.display = "none";
}

export function scheduleHideCommitTooltip(deps: HistoryDeps) {
  if (deps.state.commits.commitTipHideTimer) clearTimeout(deps.state.commits.commitTipHideTimer);
  deps.state.commits.commitTipHideTimer = setTimeout(() => hideCommitTooltip(deps), 200);
}

export function cancelHideCommitTooltip({ state }: HistoryDeps) {
  if (state.commits.commitTipHideTimer) { clearTimeout(state.commits.commitTipHideTimer); state.commits.commitTipHideTimer = 0; }
}

export async function showCommitTooltip(row: any, hash: string, deps: HistoryDeps) {
  const { state } = deps;
  state.commits.commitTipHash = hash;
  buildCommitTooltip(deps);
  try {
    const c = await getCommitDetail(hash, deps);
    if (state.commits.commitTipHash !== hash) return;
    state.commits.commitTipEl!.innerHTML = commitTooltipHTML(c, deps);
    // Resolve the GitHub link promise to fill in the real URL.
    githubCommitUrl(hash, deps).then((link) => {
      if (state.commits.commitTipHash !== hash || !state.commits.commitTipEl) return;
      const linkEl = state.commits.commitTipEl.querySelector(".sol-exp-commit-tip-link");
      if (linkEl && link) linkEl.setAttribute("href", link);
      else if (linkEl && !link) linkEl.remove();
    });
    positionCommitTooltip(row, deps);
  } catch {
    if (state.commits.commitTipHash !== hash) return;
    state.commits.commitTipEl!.innerHTML = `<div style="color:var(--dsw-alias-label-secondary,#969696)">${t("loading")}</div>`;
    positionCommitTooltip(row, deps);
  }
}

export async function loadRecentCommits({ state }: HistoryDeps) {
  console.log("[sol-exp] loadRecentCommits", Date.now());
  if (!state.root || !state.scm.gitStatus || state.scm.gitStatus.branch === "unknown") return;
  // Bump the generation so a git-log fetch still in flight for
  // the previous repo/branch is discarded when it lands.
  state.commits.commitsSeq++;
  state.commits.commitsPage = 0;
  state.commits.commitsAllLoaded = false;
  // Drop the cached list: the reload shows the loading
  // placeholder until fresh commits arrive. render() reads from
  // commitsHTML, so a late render can never wipe a filled list
  // back to "Loading…".
  state.commits.commitsHTML = null;
  // Release the in-flight guard — the fetch it protects is stale
  // now and its response will be thrown away by the seq check.
  state.commits.commitsLoading = false;
  resetGraph(state.commits);
  const listEl = document.getElementById("sol-exp-commits-list");
  if (listEl) listEl.innerHTML = commitsListHTML(state.commits);
  await loadCommitsPage({ state });
}

export async function loadCommitsPage({ state }: HistoryDeps) {
  if (!state.root || state.commits.commitsLoading || state.commits.commitsAllLoaded) return;
  const seq = state.commits.commitsSeq;
  state.commits.commitsLoading = true;
  try {
    const url = `/solution-explorer/git-log?root=${encodeURIComponent(gitRoot(state))}&count=50&skip=${state.commits.commitsPage * 50}`;
    const result = await (await fetch(url)).json();
    // A newer load took over while this fetch was in flight
    // (conversation/repo switch, refresh) — discard the stale
    // response instead of writing it into the current list.
    if (seq !== state.commits.commitsSeq) return;
    console.log("[sol-exp] loadCommitsPage ok", result.ok, result.value ? result.value.length : -1, "el", !!document.getElementById("sol-exp-commits-list"));
    if (result.ok && result.value) {
      const commitsList = document.getElementById("sol-exp-commits-list");
      if (commitsList) {
        if (state.commits.commitsPage === 0 && result.value.length === 0) {
          commitsList.textContent = t("scm.log.empty");
          state.commits.commitsHTML = "";
          state.commits.commitsAllLoaded = true;
        } else {
          const items = result.value.map((commit: any) => {
            const graph = renderGraphRow(commit, state.commits);
            const selected = state.commits.graphDetailOpen === commit.hash ? " selected" : "";
            return `<div class="sol-exp-commit-item${selected}" data-hash="${commit.hash}" onclick="window.__solExpCommitDetail('${commit.hash}')"><span class="sol-exp-graph">${graph}</span><span class="sol-exp-commit-hash">${commit.shortHash}</span><span class="sol-exp-commit-msg">${escapeHtml(commit.message.substring(0, 60))}${commit.message.length > 60 ? "..." : ""}</span><span class="sol-exp-commit-date">${relTime(commit.timestamp)}</span></div>`;
          }).join("");
          if (state.commits.commitsPage === 0) commitsList.innerHTML = items;
          else commitsList.insertAdjacentHTML("beforeend", items);
          state.commits.commitsHTML = state.commits.commitsPage === 0 ? items : (state.commits.commitsHTML || "") + items;
          state.commits.commitsPage++;
          if (result.value.length < 50) state.commits.commitsAllLoaded = true;
        }
      }
    }
  } catch (err) {
    if (seq === state.commits.commitsSeq) console.error("Failed to load commits:", err);
  } finally {
    // Only the current generation may release the in-flight
    // guard; a stale fetch must not clear a newer one's flag.
    if (seq === state.commits.commitsSeq) state.commits.commitsLoading = false;
  }
}
