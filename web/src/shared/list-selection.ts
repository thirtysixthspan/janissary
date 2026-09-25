// The keyboard selection rule every plugin record list shares: ArrowDown and ArrowUp step by one and
// stop at the ends rather than wrapping, so holding a key settles on the last or first row instead of
// cycling past it; Home and End jump to the ends. An empty list has no selection, and any other key
// leaves the selection where it was. A list with no selection yet steps from the first row.
export function nextListSelection(length: number, selected: number | null, key: string): number | null {
  if (length === 0) return null;
  const index = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(index + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(index - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}
