import type { SqlConsoleResult } from '@shared/plugins/sql/shared';

/** What a statement reports once it has run: how many rows it changed, or the failure that stopped it. */
export function logOutcome(entry: SqlConsoleResult): string {
  if (entry.error) return entry.error;
  if (entry.changed === 0) return 'OK.';
  return `${entry.changed} row${entry.changed === 1 ? '' : 's'} changed.`;
}
