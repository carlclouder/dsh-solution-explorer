/** Caret helpers for the contenteditable editor and diff rows. */

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\\\\/g, "\\92;")
}

export function relTime(ts: number): string {
  const diff = Date.now() - (ts || 0)
  const m = Math.floor(diff / 60000)
  if (m < 1) return "刚刚"
  if (m < 60) return m + " 分钟前"
  const h = Math.floor(m / 60)
  if (h < 24) return h + " 小时前"
  const d = Math.floor(h / 24)
  if (d < 30) return d + " 天前"
  return new Date(ts).toLocaleDateString()
}

export function caretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const pre = document.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

export function setCaretAt(el: HTMLElement, offset: number): void {
  el.focus()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = null
  while (walker.nextNode()) {
    const len = walker.currentNode.textContent.length
    if (remaining <= len) { node = walker.currentNode; break }
    remaining -= len
  }
  const range = document.createRange()
  if (node) { range.setStart(node, remaining); range.collapse(true) }
  else { range.selectNodeContents(el); range.collapse(false) }
  const sel = window.getSelection()
  if (sel) { sel.removeAllRanges(); sel.addRange(range) }
}
