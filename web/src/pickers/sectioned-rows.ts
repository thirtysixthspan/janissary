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
