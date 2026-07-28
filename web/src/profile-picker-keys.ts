import type { ProfileRow } from '@shared/protocol';

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

export function firstProfileIndex(rows: VisibleProfileRow[]): number {
  const index = rows.findIndex((row) => !row.header);
  return index === -1 ? 0 : index;
}

function seek(rows: VisibleProfileRow[], index: number, step: number): number {
  for (let next = index + step; next >= 0 && next < rows.length; next += step) {
    if (!rows[next].header) return next;
  }
  return index;
}

export type ProfilePickerKeyOutcome = {
  index: number;
  action?: { type: 'pick'; name: string } | { type: 'close' };
};

export function handleProfilePickerKey(
  rows: VisibleProfileRow[],
  index: number,
  key: string,
): ProfilePickerKeyOutcome {
  if (rows.length === 0) return { index: 0 };
  const row = rows[index];
  if (row.header) return { index };
  if (key === 'ArrowUp') return { index: seek(rows, index, -1) };
  if (key === 'ArrowDown') return { index: seek(rows, index, 1) };
  if (key === 'Enter') return { index, action: { type: 'pick', name: row.name } };
  if (key === 'Escape') return { index, action: { type: 'close' } };
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
