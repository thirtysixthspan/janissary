import type { TaskRow } from '@shared/protocol';

// A task row annotated with its client-local expand state (directories only). The server sends
// the full recursive tree every time — the task list needs no live filesystem watching, so
// expand/collapse is purely a client concern, unlike `FileTreeRow.expanded`.
export type VisibleTaskRow = TaskRow & { expanded?: boolean };

// Depth-first walk of the full tree, hiding any row nested under a collapsed directory. Rows are
// already pre-order (a directory immediately followed by its descendants), so a single pass with
// a "skip below this depth" marker is enough — no recursion needed here.
export function flattenVisibleTaskRows(rows: TaskRow[], expandedPaths: Set<string>): VisibleTaskRow[] {
  const visible: VisibleTaskRow[] = [];
  let hideBelowDepth: number | null = null;
  for (const row of rows) {
    if (hideBelowDepth !== null && row.depth > hideBelowDepth) continue;
    hideBelowDepth = null;
    const expanded = row.dir ? expandedPaths.has(row.path) : undefined;
    visible.push(expanded === undefined ? row : { ...row, expanded });
    if (row.dir && !expanded) hideBelowDepth = row.depth;
  }
  return visible;
}

function parentIndex(rows: VisibleTaskRow[], index: number): number {
  const depth = rows[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < depth) return i;
  }
  return index;
}

function firstChildIndex(rows: VisibleTaskRow[], index: number): number {
  return index + 1 < rows.length && rows[index + 1].depth > rows[index].depth ? index + 1 : index;
}

export type TaskPickerKeyOutcome = {
  index: number;
  action?: { type: 'toggle' | 'pick'; path: string } | { type: 'close' };
};

// `→`: collapsed dir expands (selection stays, children appear next render); expanded dir moves
// selection to its first child; file is a no-op (there's no "open" concept for a task row).
function onArrowRight(rows: VisibleTaskRow[], index: number): TaskPickerKeyOutcome {
  const row = rows[index];
  if (!row.dir) return { index };
  if (!row.expanded) return { index, action: { type: 'toggle', path: row.path } };
  return { index: firstChildIndex(rows, index) };
}

// `←`: expanded dir collapses; otherwise selection moves to the parent directory (a no-op at the
// top level, where there is no parent).
function onArrowLeft(rows: VisibleTaskRow[], index: number): TaskPickerKeyOutcome {
  const row = rows[index];
  if (row.dir && row.expanded) return { index, action: { type: 'toggle', path: row.path } };
  return { index: parentIndex(rows, index) };
}

export function handleTaskPickerKey(rows: VisibleTaskRow[], index: number, key: string): TaskPickerKeyOutcome {
  if (rows.length === 0) return { index: 0 };
  const row = rows[index];
  switch (key) {
  case 'ArrowUp': { return { index: Math.max(0, index - 1) }; }
  case 'ArrowDown': { return { index: Math.min(rows.length - 1, index + 1) }; }
  case 'ArrowRight': { return onArrowRight(rows, index); }
  case 'ArrowLeft': { return onArrowLeft(rows, index); }
  case 'Enter': { return row.dir ? { index, action: { type: 'toggle', path: row.path } } : { index, action: { type: 'pick', path: row.path } }; }
  case 'Escape': { return { index, action: { type: 'close' } }; }
  }
  return { index };
}

const HANDLED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape']);

// The `useWindowKeys` dispatch glue: applies `handleTaskPickerKey`'s outcome via the passed
// callbacks, keeping the window handler's dispatch branch a single call (matching the other
// pickers' style).
export function dispatchTaskPickerKey(
  e: KeyboardEvent,
  rows: VisibleTaskRow[],
  index: number,
  setIndex: (setter: (prev: number) => number) => void,
  toggleDir: (path: string) => void,
  pickTask: (path: string) => void,
  setOpen: (open: boolean) => void,
): void {
  if (!HANDLED_KEYS.has(e.key)) return;
  e.preventDefault();
  const result = handleTaskPickerKey(rows, index, e.key);
  setIndex(() => result.index);
  switch (result.action?.type) {
  case 'toggle': { toggleDir(result.action.path); break; }
  case 'pick': { pickTask(result.action.path); break; }
  case 'close': { setOpen(false); break; }
  }
}
