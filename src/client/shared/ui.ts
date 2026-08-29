import { escapeHtml } from './dom.ts'

let toastTimer: ReturnType<typeof setTimeout> | null = null

/** Lightweight bottom-right toast; never a blocking dialog. */
export function showToast(msg: string, isError = false): void {
  let el = document.getElementById("sol-exp-toast")
  if (!el) {
    el = document.createElement("div")
    el.id = "sol-exp-toast"
    el.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:99999;max-width:340px;max-height:200px;overflow:auto;padding:8px 12px;border-radius:6px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-3,#1e1e1e));border:1px solid var(--dsw-alias-border-l2,#333);font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.35);white-space:pre-wrap;word-break:break-all;transition:opacity .3s;"
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.style.color = isError ? "var(--dsw-color-error,#f48771)" : "var(--dsw-alias-label-primary,#d4d4d4)"
  el.style.opacity = "1"
  clearTimeout(toastTimer as ReturnType<typeof setTimeout>)
  toastTimer = setTimeout(() => { el!.style.opacity = "0"; setTimeout(() => el!.remove(), 400) }, 4000)
}

// ─── Centered DSH-style dialogs ─────────────────────────────────
// Replaces native window.confirm/window.prompt with an in-page modal
// styled with the same --dsw-alias-* tokens as the rest of the panel.
export function showDialog(opts: {
  title?: string
  message?: string
  input?: boolean
  inputValue?: string
  placeholder?: string
  okText?: string
  cancelText?: string
  danger?: boolean
}): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    const zh = document.documentElement.lang?.startsWith("zh")
    const isPrompt = opts.input === true
    const okText = opts.okText || (zh ? "确定" : "OK")
    const cancelText = opts.cancelText || (zh ? "取消" : "Cancel")
    // Last dialog wins: remove any previously open modal.
    document.querySelectorAll(".sol-exp-modal-mask").forEach((el) => el.remove())
    const mask = document.createElement("div")
    mask.className = "sol-exp-modal-mask"
    mask.innerHTML =
      '<div class="sol-exp-modal-box" role="dialog" aria-modal="true">' +
      (opts.title ? `<div class="sol-exp-modal-title">${escapeHtml(opts.title)}</div>` : "") +
      (opts.message ? `<div class="sol-exp-modal-message">${escapeHtml(opts.message)}</div>` : "") +
      (isPrompt ? `<input class="sol-exp-modal-input" value="${escapeHtml(opts.inputValue || "")}" placeholder="${escapeHtml(opts.placeholder || "")}" />` : "") +
      '<div class="sol-exp-modal-actions">' +
      `<button class="sol-exp-modal-btn" data-act="cancel">${escapeHtml(cancelText)}</button>` +
      `<button class="sol-exp-modal-btn ${opts.danger ? "danger" : "primary"}" data-act="ok">${escapeHtml(okText)}</button>` +
      "</div></div>"
    let settled = false
    const finish = (value: string | boolean | null) => {
      if (settled) return
      settled = true
      mask.remove()
      resolve(value)
    }
    const input = mask.querySelector(".sol-exp-modal-input") as HTMLInputElement | null
    mask.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); finish(isPrompt ? null : false) }
      else if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); finish(isPrompt ? (input ? input.value : null) : true) }
    })
    mask.addEventListener("mousedown", (e) => { if (e.target === mask) finish(isPrompt ? null : false) })
    ;(mask.querySelector('[data-act="cancel"]') as HTMLElement | null)?.addEventListener("click", () => finish(isPrompt ? null : false))
    ;(mask.querySelector('[data-act="ok"]') as HTMLElement | null)?.addEventListener("click", () => finish(isPrompt ? (input ? input.value : null) : true))
    document.body.appendChild(mask)
    if (input) { input.focus(); input.select() }
    else { const okBtn = mask.querySelector('[data-act="ok"]') as HTMLElement | null; if (okBtn) okBtn.focus() }
  })
}

export function showConfirm(opts: Parameters<typeof showDialog>[0]): Promise<boolean> {
  return showDialog(Object.assign({}, opts, { input: false })) as Promise<boolean>
}

export function showPrompt(opts: Parameters<typeof showDialog>[0]): Promise<string | null> {
  return showDialog(Object.assign({}, opts, { input: true })) as Promise<string | null>
}
