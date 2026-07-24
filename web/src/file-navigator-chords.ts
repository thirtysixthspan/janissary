import type { FileNavigatorRow } from '@shared/protocol';

type ChordHandlers = {
  sendUndo: () => void;
  sendRedo: () => void;
  createNewFile: () => void;
  beginRename: (row: FileNavigatorRow) => void;
};

// The file tree's own Ctrl/Cmd chords — undo/redo, new file, and rename — dispatched here so
// `FileNavigatorTab.tsx`'s `onKeyDown` stays a single branch for the whole ctrl/meta case, keeping both
// its cognitive complexity and the file's line count within limits. Returns whether `key` was one
// of these chords, so the caller knows whether to prevent the default browser/window handling.
export function handleTreeChord(
  key: string, shiftKey: boolean, rows: FileNavigatorRow[], selected: string | null, handlers: ChordHandlers,
): boolean {
  const lower = key.toLowerCase();
  if (lower === 'z') { if (shiftKey) handlers.sendRedo(); else handlers.sendUndo(); return true; }
  if (lower === 'n') { handlers.createNewFile(); return true; }
  if (lower === 'r' && selected && selected !== '..') {
    const row = rows.find((r) => r.path === selected);
    if (row) handlers.beginRename(row);
    return true;
  }
  return false;
}
