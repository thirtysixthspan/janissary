import type { TaskRow } from '@shared/protocol';
import { sectionedKeyDecision, seekSelectable } from './sectioned-rows';

// A task row annotated with its client-local expand state (directories only). The server sends
// the full recursive tree every time — the task list needs no live filesystem watching, so
// expand/collapse is purely a client concern, unlike `FileTreeRow.expanded`. A row with
// `header: true` is a non-selectable section divider ("Project" / "Janissary"), not a task.
export type VisibleTaskRow = TaskRow & { expanded?: boolean; header?: boolean };
export type TaskRowIdentity = Pick<TaskRow, 'path' | 'source'>;

export function taskRowKey(source: TaskRow['source'], path: string): string {
  return JSON.stringify([source, path]);
}

function rowIdentity(row: TaskRow): TaskRowIdentity {
  return { path: row.path, source: row.source };
}

const SECTION_LABEL: Record<TaskRow['source'], string> = { project: 'Project', janissary: 'Janissary' };

function headerRow(source: TaskRow['source']): VisibleTaskRow {
  return { header: true, source, path: `\u{0}header-${source}`, name: SECTION_LABEL[source], depth: 0, dir: false };
}

// Depth-first walk of the full tree, hiding any row nested under a collapsed directory, and
// inserting a non-selectable section-header row at the start of each source group (the server
// already orders rows project-first, then janissary). Rows are pre-order (a directory immediately
// followed by its descendants), so a single pass with a "skip below this depth" marker is enough.
export function flattenVisibleTaskRows(rows: TaskRow[], expandedPaths: Set<string>): VisibleTaskRow[] {
  const visible: VisibleTaskRow[] = [];
  let hideBelowDepth: number | null = null;
  let lastSource: TaskRow['source'] | null = null;
  for (const row of rows) {
    if (row.source !== lastSource) {
      hideBelowDepth = null;
      visible.push(headerRow(row.source));
      lastSource = row.source;
    }
    if (hideBelowDepth !== null && row.depth > hideBelowDepth) continue;
    hideBelowDepth = null;
    const expanded = row.dir ? expandedPaths.has(taskRowKey(row.source, row.path)) : undefined;
    visible.push(expanded === undefined ? row : { ...row, expanded });
    if (row.dir && !expanded) hideBelowDepth = row.depth;
  }
  return visible;
}

function parentIndex(rows: VisibleTaskRow[], index: number): number {
  const depth = rows[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (!rows[i].header && rows[i].source === rows[index].source && rows[i].depth < depth) return i;
  }
  return index;
}

function firstChildIndex(rows: VisibleTaskRow[], index: number): number {
  return index + 1 < rows.length && rows[index + 1].source === rows[index].source
    && rows[index + 1].depth > rows[index].depth ? index + 1 : index;
}

export type TaskPickerKeyOutcome = {
  index: number;
  action?: { type: 'toggle' | 'pick'; row: TaskRowIdentity } | { type: 'close' };
};

// `→`: collapsed dir expands (selection stays, children appear next render); expanded dir moves
// selection to its first child; file is a no-op (there's no "open" concept for a task row).
function onArrowRight(rows: VisibleTaskRow[], index: number): TaskPickerKeyOutcome {
  const row = rows[index];
  if (!row.dir) return { index };
  if (!row.expanded) return { index, action: { type: 'toggle', row: rowIdentity(row) } };
  return { index: firstChildIndex(rows, index) };
}

// `←`: expanded dir collapses; otherwise selection moves to the parent directory (a no-op at the
// top level, where there is no parent).
function onArrowLeft(rows: VisibleTaskRow[], index: number): TaskPickerKeyOutcome {
  const row = rows[index];
  if (row.dir && row.expanded) return { index, action: { type: 'toggle', row: rowIdentity(row) } };
  return { index: parentIndex(rows, index) };
}

// Escape is handled before any row lookup so the picker always closes. A selection the server's
// list left out of range or on a header is re-seated by the keystroke without acting, so Enter
// never picks a row that was not highlighted when it was pressed. Both of those are
// `sectionedKeyDecision`; what is left is the keys a task row means something by.
export function handleTaskPickerKey(rows: VisibleTaskRow[], index: number, key: string): TaskPickerKeyOutcome {
  const decision = sectionedKeyDecision(rows, index, key);
  if (decision?.kind === 'close') return { index: decision.index, action: { type: 'close' } };
  if (decision) return { index: decision.index };
  const row = rows[index];
  switch (key) {
  case 'ArrowUp': { return { index: seekSelectable(rows, index, -1) }; }
  case 'ArrowDown': { return { index: seekSelectable(rows, index, 1) }; }
  case 'ArrowRight': { return onArrowRight(rows, index); }
  case 'ArrowLeft': { return onArrowLeft(rows, index); }
  case 'Enter': { return row.dir
    ? { index, action: { type: 'toggle', row: rowIdentity(row) } }
    : { index, action: { type: 'pick', row: rowIdentity(row) } }; }
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
  toggleDir: (row: TaskRowIdentity) => void,
  pickTask: (row: TaskRowIdentity) => void,
  setOpen: (open: boolean) => void,
): void {
  e.preventDefault();
  if (!HANDLED_KEYS.has(e.key)) return;
  const result = handleTaskPickerKey(rows, index, e.key);
  setIndex(() => result.index);
  switch (result.action?.type) {
  case 'toggle': { toggleDir(result.action.row); break; }
  case 'pick': { pickTask(result.action.row); break; }
  case 'close': { setOpen(false); break; }
  }
}
