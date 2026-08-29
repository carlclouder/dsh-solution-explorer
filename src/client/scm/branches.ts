/**
 * Remote/branch/tag loaders — SCM domain.
 * @module dsh-solution-explorer/client/scm/branches
 */

import { gitRoot, type AppState } from "../state/store.ts"

export interface BranchesDeps {
  state: AppState
}

export async function loadRemotes({ state }: BranchesDeps) {
  const result = await (await fetch(`/solution-explorer/git-remotes?root=${encodeURIComponent(gitRoot(state))}`)).json();
  state.scm.remotesList = result.ok && result.value ? result.value : [];
}

export async function loadBranches({ state }: BranchesDeps) {
  const result = await (await fetch(`/solution-explorer/git-branches?root=${encodeURIComponent(gitRoot(state))}`)).json();
  state.scm.branchesList = result.ok && result.value ? result.value : [];
}

export async function loadTags({ state }: BranchesDeps) {
  const result = await (await fetch(`/solution-explorer/git-tags?root=${encodeURIComponent(gitRoot(state))}`)).json();
  state.scm.tagsList = result.ok && result.value ? result.value : [];
}
