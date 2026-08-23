/**
 * Build config for dsh-solution-explorer.
 *
 * Emits two artifacts:
 * - lib/index.js   — the node half (host fs/git services), ESM, externalizes
 *                    node builtins and @deepseek-ai packages.
 * - lib/client.js  — the browser half, a closure-factory artifact for the
 *                    GUI's __ModuleLoader__ (CJS with banner/footer/intro).
 * @module dsh-solution-explorer/tsdown
 */
import { defineConfig } from 'tsdown'

const PKG_ID = 'dsh-solution-explorer'

/** Node half: ESM, stays external on node builtins and @deepseek-ai packages. */
const nodeExternal = (specifier: string): boolean =>
  specifier.startsWith('node:') ||
  specifier.startsWith('@deepseek-ai/') ||
  specifier === 'react' || specifier === 'react-dom' || specifier === 'react/jsx-runtime'

export default defineConfig([
  {
    name: 'dsh-solution-explorer/lib',
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: {
      neverBundle: nodeExternal,
      alwaysBundle: (specifier: string) => !nodeExternal(specifier),
    },
    outputOptions: {
      entryFileNames: 'index.js',
    },
  },
  {
    name: 'dsh-solution-explorer/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // The client half imports only its own relative modules; the loader table
    // needs nothing external, so everything inlines.
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
