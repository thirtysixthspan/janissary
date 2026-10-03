import type { SqlColumn, SqlInsertCell } from '@shared/plugins/sql/shared';

type Draft = { text: string; isNull: boolean };

function draftFor(column: SqlColumn): Draft {
  return { text: '', isNull: column.pk > 0 };
}

function isNamed(draft: Draft): boolean {
  return draft.isNull || draft.text !== '';
}

export function initialDrafts(columns: readonly SqlColumn[]): Record<string, Draft> {
  return Object.fromEntries(columns.map((column) => [column.name, draftFor(column)]));
}

export function insertCells(
  columns: readonly SqlColumn[],
  drafts: Record<string, Draft>,
): SqlInsertCell[] {
  return columns.filter((column) => isNamed(drafts[column.name] ?? draftFor(column)))
    .map((column) => ({
      column: column.name,
      value: drafts[column.name]?.isNull ? null : (drafts[column.name]?.text ?? ''),
    }));
}
