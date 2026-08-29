/** File-type icons (VS Code style, inline SVG).
 *  Type colors are content colors (like diff +/- and git status hues),
 *  intentionally fixed for cross-theme recognition. Badges are white strokes
 *  on the colored file outline. */

export function folderIcon(open: boolean): string {
  const color = open ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-label-tertiary)"
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.8 3.8h4.2l1.6 1.7h6.6a1 1 0 0 1 1 1v5.8a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1z" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>${open ? `<path d="M4.2 6.2h7.6" stroke="${color}" stroke-width="1" stroke-linecap="round"/>` : ""}</svg>`
}

const FILE_BADGES = {
  code: '<path d="M6.2 6.5L4.5 8.5l1.7 2" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.8 6.5l1.7 2-1.7 2" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M8.4 5l-0.8 7" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>',
  brace: '<path d="M6.2 6.2l-1.6 2.3 1.6 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.8 6.2l1.6 2.3-1.6 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>',
  md: '<path d="M4.5 6.8v4l3.5-4 3.5 4v-4" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>',
  image: '<path d="M3.5 10.8l2.5-3.8 2 2.6 1.5-1.6 2.5 2.8" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><circle cx="10.8" cy="5.8" r="1" stroke="#fff" stroke-width="0.9"/>',
  zip: '<path d="M6.3 5.5h3.4l-3.4 5h3.4" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>',
  hash: '<path d="M7 5.2v5.6M9 5.2v5.6M5.2 6.8h5.6M5.2 9.2h5.6" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>',
  html: '<path d="M6.3 6.2l-1.8 2.3 1.8 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.7 6.2l1.8 2.3-1.8 2.3" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M8.3 5l-0.6 7" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>',
  py: '<path d="M7.6 5.2l-3 3.6h6z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M8.4 10.8l3-3.6h-6z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>',
  db: '<path d="M4.5 5.4c0-1 1.6-1.8 3.5-1.8s3.5 0.8 3.5 1.8v5.2c0 1-1.6 1.8-3.5 1.8s-3.5-0.8-3.5-1.8z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M4.5 5.4c0 1 1.6 1.8 3.5 1.8s3.5-0.8 3.5-1.8" stroke="#fff" stroke-width="0.9"/>',
  term: '<path d="M5 6l2.4 2.5L5 11" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.5 11h2.5" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>',
  git: '<path d="M5.5 10.6V4.4" stroke="#fff" stroke-width="1" stroke-linecap="round"/><circle cx="5.5" cy="3.7" r="0.95" stroke="#fff" stroke-width="0.9"/><circle cx="5.5" cy="10.6" r="0.95" stroke="#fff" stroke-width="0.9"/><path d="M5.5 9.4c0 1.3 0.9 1.9 2.2 1.9" stroke="#fff" stroke-width="0.9"/>',
  lines: '<path d="M5 6.2h6M5 8.2h6M5 10.2h4" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
  doc: '<path d="M6.3 5.6l1.7-1.4 1.7 1.4" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 4.2v4.2" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="M5.2 8.8h5.6M5.2 10.6h3.4" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
  lock: '<path d="M5.6 7.4h4.8v3.6a0.8 0.8 0 0 1-0.8 0.8H6.4a0.8 0.8 0 0 1-0.8-0.8z" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M6.6 7.4V5.8a1.4 1.4 0 0 1 2.8 0v1.6" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
  vee: '<path d="M8 4.6l-3.2 7h2.1l1.1-2.6 1.1 2.6h2.1z" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>',
}

const FILE_ICONS: Record<string, [string, string]> = {
  // code
  "ts": ["#519aba", FILE_BADGES.code], "tsx": ["#519aba", FILE_BADGES.code], "mts": ["#519aba", FILE_BADGES.code],
  "js": ["#d1a11c", FILE_BADGES.code], "jsx": ["#d1a11c", FILE_BADGES.code], "mjs": ["#d1a11c", FILE_BADGES.code], "cjs": ["#d1a11c", FILE_BADGES.code],
  "vue": ["#42b883", FILE_BADGES.vee],
  // config
  "json": ["#e2b714", FILE_BADGES.brace], "yaml": ["#e2b714", FILE_BADGES.brace], "yml": ["#e2b714", FILE_BADGES.brace], "toml": ["#e2b714", FILE_BADGES.brace], "ini": ["#e2b714", FILE_BADGES.brace], "conf": ["#e2b714", FILE_BADGES.brace], "env": ["#e2b714", FILE_BADGES.brace], "editorconfig": ["#e2b714", FILE_BADGES.brace],
  // docs
  "md": ["#c586c0", FILE_BADGES.md], "mdx": ["#c586c0", FILE_BADGES.md], "markdown": ["#c586c0", FILE_BADGES.md],
  "txt": ["#969696", FILE_BADGES.lines], "log": ["#969696", FILE_BADGES.lines], "text": ["#969696", FILE_BADGES.lines],
  "pdf": ["#ff6b6b", FILE_BADGES.doc], "doc": ["#2b579a", FILE_BADGES.doc], "docx": ["#2b579a", FILE_BADGES.doc], "xls": ["#217346", FILE_BADGES.doc], "xlsx": ["#217346", FILE_BADGES.doc], "ppt": ["#d24726", FILE_BADGES.doc], "pptx": ["#d24726", FILE_BADGES.doc],
  // media
  "png": ["#4ec9b0", FILE_BADGES.image], "jpg": ["#4ec9b0", FILE_BADGES.image], "jpeg": ["#4ec9b0", FILE_BADGES.image], "gif": ["#4ec9b0", FILE_BADGES.image], "webp": ["#4ec9b0", FILE_BADGES.image], "svg": ["#4ec9b0", FILE_BADGES.image], "ico": ["#4ec9b0", FILE_BADGES.image], "bmp": ["#4ec9b0", FILE_BADGES.image],
  "ttf": ["#c586c0", FILE_BADGES.doc], "otf": ["#c586c0", FILE_BADGES.doc], "woff": ["#c586c0", FILE_BADGES.doc], "woff2": ["#c586c0", FILE_BADGES.doc],
  // archive
  "zip": ["#cc8800", FILE_BADGES.zip], "tgz": ["#cc8800", FILE_BADGES.zip], "tar": ["#cc8800", FILE_BADGES.zip], "gz": ["#cc8800", FILE_BADGES.zip], "7z": ["#cc8800", FILE_BADGES.zip], "rar": ["#cc8800", FILE_BADGES.zip],
  // web & style
  "html": ["#e44d26", FILE_BADGES.html], "htm": ["#e44d26", FILE_BADGES.html], "xhtml": ["#e44d26", FILE_BADGES.html],
  "css": ["#519aba", FILE_BADGES.hash], "scss": ["#519aba", FILE_BADGES.hash], "less": ["#519aba", FILE_BADGES.hash],
  // data & scripts
  "py": ["#3572a5", FILE_BADGES.py], "python": ["#3572a5", FILE_BADGES.py],
  "sql": ["#569cd6", FILE_BADGES.db], "db": ["#569cd6", FILE_BADGES.db], "csv": ["#569cd6", FILE_BADGES.db], "tsv": ["#569cd6", FILE_BADGES.db], "parquet": ["#569cd6", FILE_BADGES.db],
  "sh": ["#f14c4c", FILE_BADGES.term], "bash": ["#f14c4c", FILE_BADGES.term], "zsh": ["#f14c4c", FILE_BADGES.term], "ps1": ["#f14c4c", FILE_BADGES.term], "bat": ["#f14c4c", FILE_BADGES.term], "cmd": ["#f14c4c", FILE_BADGES.term],
  // git & misc
  "gitignore": ["#6e6e6e", FILE_BADGES.git], "gitattributes": ["#6e6e6e", FILE_BADGES.git], "gitmodules": ["#6e6e6e", FILE_BADGES.git], "gitconfig": ["#6e6e6e", FILE_BADGES.git],
  "lock": ["#d7a94e", FILE_BADGES.lock], "lockb": ["#d7a94e", FILE_BADGES.lock],
  "bin": ["#8a8a8a", FILE_BADGES.lines], "so": ["#8a8a8a", FILE_BADGES.lines], "dll": ["#8a8a8a", FILE_BADGES.lines], "exe": ["#8a8a8a", FILE_BADGES.lines],
  "_default": ["#d4d4d4", ""],
}

export function fileIcon(name: string): string {
  const ext = (name.includes(".") ? name.split(".").pop() : name).toLowerCase()
  const [color, badge] = FILE_ICONS[ext] || FILE_ICONS["_default"]
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 1.8h6.2l2.5 2.5v9.4a0.8 0.8 0 0 1-0.8 0.8H3.8a0.8 0.8 0 0 1-0.8-0.8V2.6a0.8 0.8 0 0 1 0.8-0.8z" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.7 1.8v2.5h2.5" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>${badge}</svg>`
}

// Image extensions that open in the editor's image preview (kept in
// sync with the host's IMAGE_EXT set).
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"])

export function isImageFile(name: string): boolean {
  const ext = (name.includes(".") ? name.split(".").pop() : name).toLowerCase()
  return IMAGE_EXTS.has(ext)
}

// Shared git-status class mapping so the tree badge, the SCM badge
// and any future surfaces render the same way: '?' -> q (untracked),
// '!' -> x (ignored), multi-letter conflict states -> first letter.
export function gitStatusClass(s: string): string {
  if (s === "?") return "q"
  if (s === "!") return "x"
  return s.length > 1 ? s[0] : s
}
