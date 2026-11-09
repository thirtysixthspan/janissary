import type { DisabledApplicationCommand } from '@shared/protocol';

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

function longestForm(row: DisabledApplicationCommand, normalized: string): number {
  return Math.max(0, ...[row.name, ...row.aliases, ...row.forms]
    .filter((form) => normalized === form || normalized.startsWith(`${form} `))
    .map((form) => form.length));
}

function canonicalFormMatch(row: DisabledApplicationCommand, normalized: string): number {
  return row.forms.some((form) => form === row.name
    && (normalized === form || normalized.startsWith(`${form} `))) ? 1 : 0;
}

export function disabledApplicationCommand(
  input: string,
  rows: readonly DisabledApplicationCommand[] = [],
): DisabledApplicationCommand | undefined {
  if (input.startsWith('!')) return undefined;
  const normalized = normalize(input.replace(/^\//u, ''));
  if (!normalized) return undefined;
  return rows
    .filter((row) => [row.name, ...row.aliases, ...row.forms]
      .some((form) => normalized === form || normalized.startsWith(`${form} `)))
    .toSorted((left, right) => {
      const length = longestForm(right, normalized) - longestForm(left, normalized);
      return length === 0
        ? canonicalFormMatch(right, normalized) - canonicalFormMatch(left, normalized)
        : length;
    })[0];
}
