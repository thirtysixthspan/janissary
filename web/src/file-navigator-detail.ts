import type { FileNavigatorDetail, FileNavigatorRow } from '@shared/protocol';

// The file navigator's detail cycle: which mode the header button moves to next, what its tooltip
// says, and how each mode's raw stat value renders. Mirrors `dock-cycle.ts` — the cycle order lives
// client-side; the server only stores whichever mode it is told.

const CYCLE: FileNavigatorDetail[] = ['name', 'size', 'modified', 'permissions'];

const TOOLTIPS: Record<FileNavigatorDetail, string> = {
  name: 'Show name only',
  size: 'Show size',
  modified: 'Show modified',
  permissions: 'Show permissions',
};

const SIZE_UNITS = ['b', 'k', 'M', 'G', 'T'];

export function nextDetail(current?: FileNavigatorDetail): FileNavigatorDetail {
  const index = CYCLE.indexOf(current ?? 'name');
  return CYCLE[(index + 1) % CYCLE.length];
}

export function detailTooltip(mode: FileNavigatorDetail): string {
  return TOOLTIPS[mode];
}

// A byte count as a compact, single-letter size: `22b`, `24k`, `32M`, `5G`. Deliberately narrower
// than the server's `humanSize` (`1.4 MB`), since the value shares a row with the filename and the
// column disappears entirely in a narrow sidebar.
export function formatSize(bytes?: number): string {
  if (bytes === undefined) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) { value /= 1024; unit++; }
  return `${Math.round(value)}${SIZE_UNITS[unit]}`;
}

// A timestamp as `Jul 13 23:29` — 24-hour, never a year, so every value is the same width.
export function formatModified(epochMs?: number): string {
  if (epochMs === undefined) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(epochMs));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('month')} ${value('day')} ${value('hour')}:${value('minute')}`;
}

// A numeric stat mode as `drwxr-xr-x`: the entry type, then the owner/group/other permission
// triples. Only the type characters the tree can actually show are named; anything else reads `-`.
export function formatPermissions(mode?: number): string {
  if (mode === undefined) return '';
  const type = (mode & 0o17_0000) === 0o04_0000 ? 'd' : ((mode & 0o17_0000) === 0o12_0000 ? 'l' : '-');
  const bits = [...'rwxrwxrwx'];
  return type + bits.map((bit, index) => ((mode & (0o400 >> index)) ? bit : '-')).join('');
}

// The text a row shows for the tab's current mode — the empty string whenever the row carries no
// value for it, which is what leaves directories blank in size mode and every row blank in `name`.
export function rowDetail(row: FileNavigatorRow, mode?: FileNavigatorDetail): string {
  if (mode === 'size') return formatSize(row.size);
  if (mode === 'modified') return formatModified(row.modified);
  if (mode === 'permissions') return formatPermissions(row.mode);
  return '';
}
