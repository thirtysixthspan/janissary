type ScriptsKeyMeaning = 'move' | 'open' | 'delete';

const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End']);
const DELETE_KEYS = new Set(['Delete', 'Backspace']);

export function keyMeaning(key: string): ScriptsKeyMeaning | null {
  if (MOVE_KEYS.has(key)) return 'move';
  if (key === 'Enter') return 'open';
  if (DELETE_KEYS.has(key)) return 'delete';
  return null;
}

export function rowIndexOf(rows: readonly { readonly name: string }[], name: string | null): number | null {
  if (name === null) return null;
  const index = rows.findIndex((row) => row.name === name);
  return index === -1 ? null : index;
}

export function nameAfterRemoval(rows: readonly { readonly name: string }[], name: string): string | null {
  const index = rows.findIndex((row) => row.name === name);
  if (index === -1) return null;
  return rows[index + 1]?.name ?? rows[index - 1]?.name ?? null;
}
