// The app-wide file-navigator clipboard: a module-level store (outside React, like
// `file-navigator-selection-registry.ts`) so a copy made in one navigator pastes into any other,
// even one rooted at an unrelated path. Holds a mode and an ordered list of absolute paths.

export type ClipboardMode = 'copy' | 'cut';
export type ClipboardSnapshot = { mode: ClipboardMode; paths: string[] } | null;

let snapshot: ClipboardSnapshot = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function setClipboard(mode: ClipboardMode, paths: string[]): void {
  if (paths.length === 0) return;
  snapshot = { mode, paths };
  notify();
}

export function clearClipboard(): void {
  if (snapshot === null) return;
  snapshot = null;
  notify();
}

export function getClipboardSnapshot(): ClipboardSnapshot {
  return snapshot;
}

export function subscribeClipboard(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// The clipboard mode a tree-relative `path` in the navigator rooted at `absoluteRoot` is currently
// on, or `null` when it isn't on the clipboard at all — so a row can ask "am I on the clipboard,
// and how?" without recomputing the whole set itself. Both modes are marked, each in its own way
// (see `.files-row.cut` / `.files-row.copied` in theme.css).
export function pendingClipboardMode(absoluteRoot: string, path: string): ClipboardMode | null {
  if (!snapshot) return null;
  const absolute = path === '' ? absoluteRoot : `${absoluteRoot}/${path}`;
  return snapshot.paths.includes(absolute) ? snapshot.mode : null;
}
