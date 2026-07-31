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

// Whether a tree-relative `path` in the navigator rooted at `absoluteRoot` is on a pending cut —
// so a row can ask "am I on the clipboard?" without recomputing the whole set itself.
export function isPendingCut(absoluteRoot: string, path: string): boolean {
  if (!snapshot || snapshot.mode !== 'cut') return false;
  const absolute = path === '' ? absoluteRoot : `${absoluteRoot}/${path}`;
  return snapshot.paths.includes(absolute);
}
