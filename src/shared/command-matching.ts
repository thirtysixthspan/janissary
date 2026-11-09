export type CommandMatchRow = Readonly<{
  name: string;
  aliases: readonly string[];
  forms: readonly string[];
}>;

export function normalizeCommandName(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

export function atFormBoundary(normalized: string, form: string): boolean {
  return normalized === form || normalized.startsWith(`${form} `);
}

function spellings(row: CommandMatchRow): readonly string[] {
  return [row.name, ...row.aliases, ...row.forms];
}

export function matchesCommandRow(row: CommandMatchRow, normalized: string): boolean {
  return spellings(row).some((form) => atFormBoundary(normalized, form));
}

function longestForm(row: CommandMatchRow, normalized: string): number {
  return Math.max(0, ...spellings(row)
    .filter((form) => atFormBoundary(normalized, form))
    .map((form) => form.length));
}

function canonicalFormMatch(row: CommandMatchRow, normalized: string): number {
  return row.forms.some((form) => form === row.name && atFormBoundary(normalized, form)) ? 1 : 0;
}

export function rankCommandRows<Row extends CommandMatchRow>(rows: readonly Row[], normalized: string): Row[] {
  return rows
    .filter((row) => matchesCommandRow(row, normalized))
    .toSorted((left, right) => {
      const length = longestForm(right, normalized) - longestForm(left, normalized);
      return length === 0
        ? canonicalFormMatch(right, normalized) - canonicalFormMatch(left, normalized)
        : length;
    });
}
