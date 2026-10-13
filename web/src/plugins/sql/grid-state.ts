import type { SqlGrid, SqlPayload, SqlRow } from '@shared/plugins/sql/shared';
import { readOnlyReason, statementResult } from './grid-view';

export type GridWriteState = {
  object: SqlPayload['objects'][number] | undefined;
  statement: boolean;
  writable: boolean;
  readOnly: string | null;
};

export function projectGridWriteState(payload: SqlPayload): GridWriteState {
  const object = payload.objects.find((entry) => entry.name === payload.object);
  const statement = statementResult(payload.grid);
  return {
    object,
    statement,
    writable: object?.writable === true && !statement,
    readOnly: readOnlyReason(object, statement),
  };
}

export function cellDraftValue(grid: SqlGrid | null, row: SqlRow, column: string): string | null {
  const cellIndex = grid?.columns.indexOf(column) ?? -1;
  const cell = row.cells[cellIndex];
  return cell?.isNull ? null : cell?.text ?? '';
}
