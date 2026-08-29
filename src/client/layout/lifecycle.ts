/**
 * Panel mount lifecycle — layout domain.
 * @module dsh-solution-explorer/client/layout/lifecycle
 */

import type { GridDeps } from "./grid.ts"

import { mountColumn } from "./grid.ts"

/** Wait for the DSH frame column to appear, then mount the panel column. */
export function waitForFrame(deps: GridDeps): void {

					mountColumn(deps);

					if (deps.state.layout.panelFrame !== null) return;

					deps.state.layout.mountObs = new MutationObserver(() => {

						mountColumn(deps);

						if (deps.state.layout.panelFrame !== null) deps.state.layout.mountObs?.disconnect();

					});

					deps.state.layout.mountObs.observe(document.body, {

						childList: true,

						subtree: true

					});

				}
