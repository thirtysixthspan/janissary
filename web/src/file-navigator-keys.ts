import type { FileNavigatorRow } from '@shared/protocol';

// How the outcome's `selection` should be applied to the tree's current selection: `replace` (the
// default) collapses onto it, `extend` grows the range from the anchor to it, and `keep` leaves the
// selection exactly as it is — a shifted arrow that has run out of rows to move onto.
export type SelectionApply = 'replace' | 'extend' | 'keep';

// The result of a keydown on the file navigator: the row that should now be selected, how to apply
// it, plus an optional action to perform (toggle a directory, or open/edit a file). Pure — no
// DOM — so it's unit-testable without rendering anything.
export type FileNavigatorKeyOutcome = {
  selection: string | null;
  apply?: SelectionApply;
  action?: { type: 'toggle' | 'open' | 'edit' | 'reroot'; path: string };
};

function indexOf(rows: FileNavigatorRow[], selected: string | null): number {
  const found = selected === null ? -1 : rows.findIndex((r) => r.path === selected);
  return found === -1 ? 0 : found;
}

// The nearest ancestor directory's path, found by walking backward for the first row at a
// shallower depth (rows are a depth-first, pre-flattened list, so this is always the parent).
function parentOf(rows: FileNavigatorRow[], index: number): string | null {
  const depth = rows[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < depth) return rows[i].path;
  }
  return null;
}

// `↑`/`↓`: the cursor moves one visible row, clamped at both ends. Holding Shift extends the
// selection from the anchor to the new cursor instead of collapsing onto it — the same range
// Shift-click builds — and at either end the shifted arrow leaves the selection untouched rather
// than collapsing it.
function onArrowVertical(
  rows: FileNavigatorRow[], index: number, key: string, shiftKey: boolean,
): FileNavigatorKeyOutcome {
  const step = key === 'ArrowDown' ? 1 : -1;
  const next = Math.min(Math.max(index + step, 0), rows.length - 1);
  if (!shiftKey) return { selection: rows[next].path };
  if (next === index) return { selection: rows[index].path, apply: 'keep' };
  return { selection: rows[next].path, apply: 'extend' };
}

// `→`: collapsed dir expands; expanded dir reroots; file opens; ".." is a no-op.
function onArrowRight(rows: FileNavigatorRow[], index: number): FileNavigatorKeyOutcome {
  const row = rows[index];
  if (row.path === '..') return { selection: row.path };
  if (!row.dir) return { selection: row.path, action: { type: 'open', path: row.path } };
  if (!row.expanded) return { selection: row.path, action: { type: 'toggle', path: row.path } };
  return { selection: row.path, action: { type: 'reroot', path: row.path } };
}

// `←`: expanded dir collapses; otherwise selection moves to the parent directory. ".." is a no-op.
function onArrowLeft(rows: FileNavigatorRow[], index: number): FileNavigatorKeyOutcome {
  const row = rows[index];
  if (row.path === '..') return { selection: row.path };
  if (row.dir && row.expanded) return { selection: row.path, action: { type: 'toggle', path: row.path } };
  return { selection: parentOf(rows, index) ?? row.path };
}

// `Enter`/`Space`: dir toggles expand/collapse; file opens (or edits, with Shift);
// ".." navigates to the parent directory.
function onActivate(rows: FileNavigatorRow[], index: number, shiftKey: boolean): FileNavigatorKeyOutcome {
  const row = rows[index];
  if (row.path === '..') return { selection: row.path, action: { type: 'reroot', path: '..' } };
  if (row.dir) return { selection: row.path, action: { type: 'toggle', path: row.path } };
  return { selection: row.path, action: { type: shiftKey ? 'edit' : 'open', path: row.path } };
}

// ARIA APG treeview keyboard pattern (VS Code-aligned) — see spec/file-navigator-tab.md.
export function handleFileNavigatorKey(
  rows: FileNavigatorRow[],
  selected: string | null,
  key: string,
  shiftKey: boolean,
  pageSize: number,
): FileNavigatorKeyOutcome {
  if (rows.length === 0) return { selection: null };
  const index = indexOf(rows, selected);

  if (key === 'ArrowDown' || key === 'ArrowUp') return onArrowVertical(rows, index, key, shiftKey);
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
export function typeAheadMatch(rows: FileNavigatorRow[], buffer: string): string | null {
  if (!buffer) return null;
  const lower = buffer.toLowerCase();
  return rows.find((r) => r.name.toLowerCase().startsWith(lower))?.path ?? null;
}
