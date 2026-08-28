import { notify } from '../notifications.js';
import type { Managers } from '../managers.js';
import type { BatchResult } from '../protocol.js';

const MAX_NAMED = 3;

function itemName(itemPath: string): string {
  return itemPath.slice(itemPath.lastIndexOf('/') + 1);
}

function failureReasonText(result: BatchResult, shownPaths: string[]): string {
  const reasons = shownPaths
    .map((failedPath) => ({ name: itemName(failedPath), reason: result.failureReasons?.[failedPath] }))
    .filter((entry): entry is { name: string; reason: string } => entry.reason !== undefined);
  if (reasons.length === 0) return '';
  const unique = new Set(reasons.map(({ reason }) => reason));
  if (reasons.length === shownPaths.length && unique.size === 1) {
    return `. ${reasons[0].reason}.`;
  }
  const details = reasons.map(({ name, reason }) => `${name}: ${reason}`).join(' | ');
  return `. Reasons: ${details}.`;
}

// Every file-navigator operation reports its failures as one notifications-feed line rather than a
// modal dialog (see the plan's design decision 9). `verb` is `copy` for a copy-paste, `move` for a
// cut-paste, a drag-move, or a move replay, `rename` for a rename, and `delete` for a delete. Names
// are given in selection order and truncated past three with `… and N more`, so one operation is
// always one feed line.
export function operationFailureText(verb: string, result: BatchResult): string {
  const shownPaths = result.failedPaths.slice(0, MAX_NAMED);
  const shown = shownPaths.map((failedPath) => itemName(failedPath)).join(', ');
  const rest = result.failedPaths.length > MAX_NAMED
    ? `, … and ${result.failedPaths.length - MAX_NAMED} more`
    : '';
  return `Could not ${verb} ${result.failedPaths.length} of ${result.total} items: ${shown}${rest}${failureReasonText(result, shownPaths)}`;
}

// Posts a `file-operation` notification for `result` when it carries any failures; a no-op
// otherwise. `label` is the file-navigator tab the operation happened in.
export function reportOperationFailure(managers: Managers, label: string, verb: string, result: BatchResult): void {
  if (result.failedPaths.length === 0) return;
  notify(managers, 'file-operation', label, operationFailureText(verb, result));
}
