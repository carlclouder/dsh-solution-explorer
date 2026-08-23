/**
 * Lightweight syntax highlighting for the solution explorer editor and diff
 * views, built on highlight.js (core + a curated language set + GitHub Dark
 * theme). Regex-based tokenization keeps per-keystroke re-highlighting cheap.
 * @module dsh-solution-explorer/client/highlight
 */

import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import diffLang from 'highlight.js/lib/languages/diff'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('diff', diffLang)

/** File extension -> hljs language id. */
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  html: 'xml', htm: 'xml', vue: 'xml', svg: 'xml', xml: 'xml',
  css: 'css', scss: 'css', less: 'css',
  py: 'python',
  md: 'markdown', markdown: 'markdown',
  yaml: 'yaml', yml: 'yaml',
  diff: 'diff', patch: 'diff',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  java: 'java',
  go: 'go',
  rs: 'rust',
}

/** Language id for a file path (by extension), or undefined when unknown. */
export function langFromPath(path: string): string | undefined {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return undefined
  return EXT_LANG[name.slice(dot + 1).toLowerCase()]
}

/** Highlight code to a single HTML string (for the editor overlay). */
export function highlightToHtml(code: string, lang: string | undefined): string | undefined {
  if (!lang) return undefined
  try {
    return hljs.highlight(code, { language: lang }).value
  } catch {
    return undefined
  }
}

/** Highlight each line independently to HTML (for the diff left column rows). */
export function highlightLinesHtml(code: string, lang: string | undefined): string[] | undefined {
  if (!lang) return undefined
  try {
    return code.split('\n').map(line => hljs.highlight(line, { language: lang }).value)
  } catch {
    return undefined
  }
}
