import type { FileTreeRow } from '@shared/protocol';

// The result of a keydown on the file tree: the row that should now be selected, plus an
// optional action to perform (toggle a directory, or open/edit a file). Pure — no DOM — so it's
// unit-testable without rendering anything.
export type FileTreeKeyOutcome = {
  selection: string | null;
  action?: { type: 'toggle' | 'open' | 'edit'; path: string };
};

function indexOf(rows: FileTreeRow[], selected: string | null): number {
  const found = selected === null ? -1 : rows.findIndex((r) => r.path === selected);
  return found === -1 ? 0 : found;
}

// The nearest ancestor directory's path, found by walking backward for the first row at a
// shallower depth (rows are a depth-first, pre-flattened list, so this is always the parent).
function parentOf(rows: FileTreeRow[], index: number): string | null {
  const depth = rows[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < depth) return rows[i].path;
  }
  return null;
}

// `→`: collapsed dir expands (selection stays); expanded dir moves to its first child; file is a no-op.
function onArrowRight(rows: FileTreeRow[], index: number): FileTreeKeyOutcome {
  const row = rows[index];
  if (!row.dir) return { selection: row.path };
  if (!row.expanded) return { selection: row.path, action: { type: 'toggle', path: row.path } };
  const child = rows[index + 1];
  return child && child.depth === row.depth + 1 ? { selection: child.path } : { selection: row.path };
}

// `←`: expanded dir collapses; otherwise selection moves to the parent directory.
function onArrowLeft(rows: FileTreeRow[], index: number): FileTreeKeyOutcome {
  const row = rows[index];
  if (row.dir && row.expanded) return { selection: row.path, action: { type: 'toggle', path: row.path } };
  return { selection: parentOf(rows, index) ?? row.path };
}

// `Enter`/`Space`: dir toggles expand/collapse; file opens (or edits, with Alt).
function onActivate(rows: FileTreeRow[], index: number, shiftKey: boolean): FileTreeKeyOutcome {
  const row = rows[index];
  if (row.dir) return { selection: row.path, action: { type: 'toggle', path: row.path } };
  return { selection: row.path, action: { type: shiftKey ? 'edit' : 'open', path: row.path } };
}

// ARIA APG treeview keyboard pattern (VS Code-aligned) — see spec/file-tree-tab.md.
export function handleFileTreeKey(
  rows: FileTreeRow[],
  selected: string | null,
  key: string,
  shiftKey: boolean,
  pageSize: number,
): FileTreeKeyOutcome {
  if (rows.length === 0) return { selection: null };
  const index = indexOf(rows, selected);

  if (key === 'ArrowDown') return { selection: rows[Math.min(index + 1, rows.length - 1)].path };
  if (key === 'ArrowUp') return { selection: rows[Math.max(index - 1, 0)].path };
  if (key === 'Home') return { selection: rows[0].path };
  if (key === 'End') return { selection: rows.at(-1)!.path };
  if (key === 'PageDown') return { selection: rows[Math.min(index + pageSize, rows.length - 1)].path };
  if (key === 'PageUp') return { selection: rows[Math.max(index - pageSize, 0)].path };
  if (key === 'ArrowRight') return onArrowRight(rows, index);
  if (key === 'ArrowLeft') return onArrowLeft(rows, index);
  if (key === 'Enter' || key === ' ') return onActivate(rows, index, shiftKey);

  return { selection: rows[index].path };
}

// Jump to the next visible row whose name starts with `buffer` (case-insensitive), or null if
// nothing matches. `buffer` is the accumulated type-ahead prefix; the caller owns its ~700ms reset.
export function typeAheadMatch(rows: FileTreeRow[], buffer: string): string | null {
  if (!buffer) return null;
  const lower = buffer.toLowerCase();
  return rows.find((r) => r.name.toLowerCase().startsWith(lower))?.path ?? null;
}
