// Row arithmetic shared by the sectioned pickers (tasks, profiles), whose lists interleave
// non-selectable section-header rows with selectable ones. The rows are rebuilt from every server
// broadcast, so a stored index can outlive the list it was chosen from; `normalizeIndex` is how a
// picker gets back onto a real row.
type SectionedRow = { header?: boolean };

// The first selectable (non-header) row, or 0 when there are none.
export function firstSelectable(rows: readonly SectionedRow[]): number {
  const index = rows.findIndex((row) => !row.header);
  return index === -1 ? 0 : index;
}

// The nearest selectable row in `step` direction (±1), skipping header rows; stays put at an edge.
export function seekSelectable(rows: readonly SectionedRow[], index: number, step: number): number {
  for (let next = index + step; next >= 0 && next < rows.length; next += step) {
    if (!rows[next].header) return next;
  }
  return index;
}

// The index clamped into range and moved off a header onto the nearest selectable row (the one
// after it first, since a header introduces its section), or 0 when there is nothing selectable.
export function normalizeIndex(rows: readonly SectionedRow[], index: number): number {
  if (rows.length === 0) return 0;
  const clamped = Math.max(0, Math.min(rows.length - 1, index));
  if (!rows[clamped].header) return clamped;
  const after = seekSelectable(rows, clamped, 1);
  if (after !== clamped) return after;
  const before = seekSelectable(rows, clamped, -1);
  return before === clamped ? 0 : before;
}

// What a keypress means before a sectioned picker has to know what its rows hold: close the picker,
// or hold the selection where it is.
export type SectionedKeyDecision = { kind: 'close'; index: number } | { kind: 'hold'; index: number };

// The opening of a sectioned picker's key handling, which is the same for every one of them because
// it says nothing about what the rows mean: Escape always closes, an empty list has no selection,
// and a selection the server's list left out of range or on a header is re-seated by the keystroke
// without acting — so Enter never picks a row that was not highlighted when it was pressed.
//
// `null` means the key is the picker's own to read, and it is then the picker's job to look the row
// up; a decision here is final, which is why the row is not fetched for a keystroke that never acts
// on it.
export function sectionedKeyDecision(
  rows: readonly SectionedRow[], index: number, key: string,
): SectionedKeyDecision | null {
  if (key === 'Escape') return { kind: 'close', index: normalizeIndex(rows, index) };
  if (rows.length === 0) return { kind: 'hold', index: 0 };
  const current = normalizeIndex(rows, index);
  if (current !== index) return { kind: 'hold', index: current };
  if (rows[index].header) return { kind: 'hold', index };
  return null;
}
