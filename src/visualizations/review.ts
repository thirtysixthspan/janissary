import type { VisualizationColumnType, VisualizationTableView } from '../protocol/visualizations.js';
import type { VisualizationRecord } from './store.js';

// The gate between a source being read and the interview asking anything. It exists because the column
// types are worked out for the user and never shown to them: a column of numbers written with thousands
// separators is inferred as text, the model is told it is text, and the whole conversation is built on a
// type nobody saw and could have corrected. A correction arriving after the first question is a
// correction to a conversation already resting on the wrong type, so the interview waits for a
// confirmation rather than following a read.
//
// Every path in has to observe it. The read path does, through `read`. The "Ask again" path does not go
// through here at all, so the manager guards it with the flag directly — left unguarded it would open an
// interview that walked straight around a gate the other path observes, which is the kind of hole that
// survives every test of the path that works.
//
// Its own module because this is a rule and not a sequence step, and because the manager was already at
// its file-size ceiling by the time this was added to it.

export class VisualizationReview {
  constructor(private readonly commit: (record: VisualizationRecord) => void) {}

  // A read that produced a different schema re-opens the review, because what the user confirmed is no
  // longer what is on screen. A read that produced the same one does not: a refresh on a timer asking for
  // a confirmation every tick would make the feature unusable.
  read(record: VisualizationRecord, table: VisualizationTableView): void {
    if (!sameSchema(record.table?.columns, table.columns)) record.reviewed = false;
    record.table = table;
  }

  // Confirming is what starts the interview. It used to be the read that did, which left nothing between a
  // misread column and the first question asked about it.
  confirm(record: VisualizationRecord): boolean {
    if (!record.table || record.reviewed) return false;
    record.reviewed = true;
    this.commit(record);
    return true;
  }

  // Only the declared type changes, and only while the review is open: a type change after the interview
  // began would invalidate questions already answered against the old schema, and there is no honest way
  // to un-ask them. The cells are left exactly as they were read, because the renderer already reads a
  // numeric string as a number and the model's sample is built from the declared types — rewriting cells
  // would be a second, lossy copy of the same decision.
  correct(record: VisualizationRecord, column: string, type: unknown): boolean {
    if (!record.table || record.reviewed) return false;
    if (!isColumnType(type)) return false;
    const found = record.table.columns.find((entry) => entry.name === column);
    if (!found) return false;
    found.type = type;
    this.commit(record);
    return true;
  }
}

// The four types a column can be declared as, which are the four the parser infers. A fifth — a currency,
// a percentage — would be a type neither the renderer nor the model branches on, so it is not offered. A
// `Set` because every use of it is a membership test.
const COLUMN_TYPES: ReadonlySet<string> = new Set<VisualizationColumnType>([
  'number', 'boolean', 'date', 'string',
]);

function isColumnType(value: unknown): value is VisualizationColumnType {
  return typeof value === 'string' && COLUMN_TYPES.has(value);
}

// Two schemas are the same when their columns are the same in the same order, names and types both.
function sameSchema(
  before: readonly { name: string; type: string }[] | undefined,
  after: readonly { name: string; type: string }[],
): boolean {
  if (!before || before.length !== after.length) return false;
  return before.every((column, index) => {
    const other = after[index];
    return other !== undefined && other.name === column.name && other.type === column.type;
  });
}
