/** Caret helpers for the contenteditable editor and diff rows. */

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
