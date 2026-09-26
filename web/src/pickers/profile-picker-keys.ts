import type { ProfileRow } from '@shared/protocol';
import { normalizeIndex, seekSelectable } from './sectioned-rows';

export type VisibleProfileRow = ProfileRow & { header?: boolean };

const LABELS: Record<ProfileRow['source'], string> = { project: 'Project', janissary: 'Janissary' };

export function profilePickerRows(profiles: ProfileRow[]): VisibleProfileRow[] {
  const rows: VisibleProfileRow[] = [];
  let lastSource: ProfileRow['source'] | undefined;
  for (const profile of profiles) {
    if (profile.source !== lastSource) {
      rows.push({ name: LABELS[profile.source], source: profile.source, header: true });
      lastSource = profile.source;
    }
    rows.push(profile);
  }
  return rows;
}

export type ProfilePickerKeyOutcome = {
  index: number;
  action?: { type: 'pick'; name: string } | { type: 'close' };
};

// Mirrors `handleTaskPickerKey`: Escape always closes, and a stale selection is re-seated without acting.
export function handleProfilePickerKey(
  rows: VisibleProfileRow[],
  index: number,
  key: string,
): ProfilePickerKeyOutcome {
  if (key === 'Escape') return { index: normalizeIndex(rows, index), action: { type: 'close' } };
  if (rows.length === 0) return { index: 0 };
  const current = normalizeIndex(rows, index);
  if (current !== index) return { index: current };
  const row = rows[index];
  if (row.header) return { index };
  if (key === 'ArrowUp') return { index: seekSelectable(rows, index, -1) };
  if (key === 'ArrowDown') return { index: seekSelectable(rows, index, 1) };
  if (key === 'Enter') return { index, action: { type: 'pick', name: row.name } };
  return { index };
}

export function dispatchProfilePickerKey(
  event: KeyboardEvent,
  rows: VisibleProfileRow[],
  index: number,
  setIndex: (setter: (previous: number) => number) => void,
  pickProfile: (name: string) => void,
  setOpen: (open: boolean) => void,
): void {
  if (!new Set(['ArrowUp', 'ArrowDown', 'Enter', 'Escape']).has(event.key)) return;
  event.preventDefault();
  const result = handleProfilePickerKey(rows, index, event.key);
  setIndex(() => result.index);
  if (result.action?.type === 'pick') pickProfile(result.action.name);
  if (result.action?.type === 'close') setOpen(false);
}
