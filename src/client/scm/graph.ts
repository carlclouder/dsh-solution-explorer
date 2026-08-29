/**
 * Commit-graph rendering — SCM domain. Pure functions over CommitState.
 * @module dsh-solution-explorer/client/scm/graph
 */

import { t } from "../locales.ts"

import type { CommitState } from "../state/store.ts"

/** Lane color palette (8 colors; wraps for >8 simultaneous branches). */
const GRAPH_COLORS = ["#e2b714", "#4ec9b0", "#58a6ff", "#d2a8ff", "#ff7b72", "#79c0ff", "#7ee787", "#ffa657"];

export function resetGraph(commits: CommitState) {
  commits.graphLanes = [];
  commits.graphPrevLanes = [];
  commits.graphDetailOpen = "";
  commits.graphColorInUse = new Set();
}

export function allocGraphColor(commits: CommitState): number {
  for (let c = 0; c < GRAPH_COLORS.length; c++) {
    if (!commits.graphColorInUse.has(c)) { commits.graphColorInUse.add(c); return c; }
  }
  // More active lanes than colors: wrap (rare; >8 simultaneous branches).
  return commits.graphColorInUse.size % GRAPH_COLORS.length;
}

export function freeGraphColor(commits: CommitState, c: number) {
  commits.graphColorInUse.delete(c);
}

export function renderGraphRow(commit: any, commits: CommitState): string {
  const laneW = 14, rowH = 20, nodeR = 3;
  const parents = commit.parents || [];
  let idx = commits.graphLanes.findIndex((l) => l.hash === commit.hash);
  if (idx === -1) { idx = commits.graphLanes.length; commits.graphLanes.push({ hash: commit.hash, color: allocGraphColor(commits) }); }
  const nodeColor = commits.graphLanes[idx].color;

  // Build the next row's lanes now so merge fork lines can be drawn into them.
  const nextLanes = commits.graphLanes.slice();
  nextLanes.splice(idx, 1);
  if (parents[0]) nextLanes.splice(idx, 0, { hash: parents[0], color: nodeColor });
  else freeGraphColor(commits, nodeColor);
  const forks = [];
  for (let p = 1; p < parents.length; p++) {
    const color = allocGraphColor(commits);
    forks.push({ hash: parents[p], color, x: (nextLanes.length + forks.length) * laneW + laneW / 2 });
  }

  const width = Math.max(laneW, (nextLanes.length + forks.length) * laneW);
  let svg = `<svg class="sol-exp-graph-svg" width="${width}" height="${rowH}">`;

  // Lane transitions from the previous row (smooth S-curves).
  commits.graphPrevLanes.forEach((pl, pi) => {
    const ci = commits.graphLanes.findIndex((l) => l.hash === pl.hash);
    if (ci !== -1 && ci !== pi) {
      const x1 = pi * laneW + laneW / 2, x2 = ci * laneW + laneW / 2;
      svg += `<path d="M ${x1} 0 C ${x1} ${rowH / 2}, ${x2} ${rowH / 2}, ${x2} ${rowH}" fill="none" stroke="${GRAPH_COLORS[pl.color % GRAPH_COLORS.length]}" stroke-width="2" opacity="0.7"/>`;
    }
  });

  // Vertical lanes + this commit's node.
  commits.graphLanes.forEach((lane, i) => {
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
  commits.graphPrevLanes = commits.graphLanes.slice();
  commits.graphLanes = nextLanes;
  for (const f of forks) commits.graphLanes.push({ hash: f.hash, color: f.color });
  return svg;
}

export function commitsListHTML(commits: CommitState): string {
  if (commits.commitsHTML === null) return "Loading...";
  if (commits.commitsHTML === "") return t("scm.log.empty");
  return commits.commitsHTML;
}
