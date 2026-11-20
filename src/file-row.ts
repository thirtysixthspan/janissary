import { constants } from 'node:fs';
import type { RowStat } from './file-navigator/stats.js';

const { S_IFDIR, S_IFMT } = constants;

const BITS = [
  [0o400, 'r'], [0o200, 'w'], [0o100, 'x'],
  [0o040, 'r'], [0o020, 'w'], [0o010, 'x'],
  [0o004, 'r'], [0o002, 'w'], [0o001, 'x'],
] as const;

export function formatFileRow(name: string, stat: RowStat): string {
  const isDirectory = (stat.mode & S_IFMT) === S_IFDIR;
  let permissions = isDirectory ? 'd' : '-';
  for (const [bit, letter] of BITS) permissions += stat.mode & bit ? letter : '-';
  return `${isDirectory ? 'dir' : 'file'} ${permissions} ${stat.size} ${new Date(stat.modified).toISOString()} ${name}`;
}
