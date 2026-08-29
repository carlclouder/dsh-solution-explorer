/** Editor tab state — a module-level singleton shared by the open/save bridge
 *  handlers inside apply() and the EditorView React component. Kept as a plain
 *  mutable object (not a subscription store) so the existing explicit
 *  notify-editor-listeners call sites stay unchanged. */
export const editorStore = {
  file: null as string | null,
  content: null as string | null,
  loading: false,
  error: null as string | null,
  saving: false,
  unsupported: false,
  image: false,
  root: "",
  listeners: new Set<() => void>(),
}

export function notifyEditorListeners(): void {
  for (const fn of editorStore.listeners) editorStore.listeners.has(fn) && fn()
}
