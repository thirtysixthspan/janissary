import type { DisabledApplicationCommand } from '@shared/protocol';
import { normalizeCommandName, rankCommandRows } from '@shared/shared/command-matching';

export function disabledApplicationCommand(
  input: string,
  rows: readonly DisabledApplicationCommand[] = [],
): DisabledApplicationCommand | undefined {
  if (input.startsWith('!')) return undefined;
  const normalized = normalizeCommandName(input.replace(/^\//u, ''));
  if (!normalized) return undefined;
  return rankCommandRows(rows, normalized)[0];
}
