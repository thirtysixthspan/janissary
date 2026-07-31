import { notify } from '../notifications.js';
import type { Managers } from '../managers.js';
import type { BatchResult } from '../protocol.js';

const MAX_NAMED = 3;

// Every file-navigator operation reports its failures as one notifications-feed line rather than a
// modal dialog (see the plan's design decision 9). `verb` is `copy` for a copy-paste, `move` for a
// cut-paste, a drag-move, or a move replay, and `delete` for a delete. Names are given in selection
// order and truncated past three with `… and N more`, so one operation is always one feed line.
export function operationFailureText(verb: string, result: BatchResult): string {
  const names = result.failedPaths.map((relPath) => relPath.slice(relPath.lastIndexOf('/') + 1));
  const shown = names.slice(0, MAX_NAMED).join(', ');
  const rest = names.length > MAX_NAMED ? `, … and ${names.length - MAX_NAMED} more` : '';
  return `Could not ${verb} ${result.failedPaths.length} of ${result.total} items: ${shown}${rest}`;
}

// Posts a `file-operation` notification for `result` when it carries any failures; a no-op
// otherwise. `label` is the file-navigator tab the operation happened in.
export function reportOperationFailure(managers: Managers, label: string, verb: string, result: BatchResult): void {
  if (result.failedPaths.length === 0) return;
  notify(managers, 'file-operation', label, operationFailureText(verb, result));
}
