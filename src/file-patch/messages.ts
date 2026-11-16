import { fileOperationReason, OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { displayPath } from '../file-write/messages.js';
import type { CommitOutcome } from './commit.js';
import type { PatchParseError } from './parse.js';
import type { PatchRow } from './rows.js';
import type { ApplySectionsResult } from './sections.js';

const UNCHANGED = 'No files were changed.';
const MAYBE_CHANGED = 'Some files may have been changed.';

export function withFinalPeriod(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

function escapedReason(reason: string): string {
  return displayPath(reason === OUTSIDE_ROOT_REASON ? 'Outside the workspace' : reason);
}

export function patchRejectionLine(error: unknown): string {
  const reason = error instanceof Error && error.message !== '' ? error.message : fileOperationReason(error);
  return withFinalPeriod(`Patch failed: ${displayPath(reason)}`);
}

export function patchSuccessText(rows: readonly PatchRow[]): string {
  const header = `Patched ${String(rows.length)} ${rows.length === 1 ? 'file' : 'files'}:`;
  return [header, ...rows.map((row) => row.letter === 'R'
    ? `R ${displayPath(row.path)} -> ${displayPath(row.target)}`
    : `${row.letter} ${displayPath(row.path)}`)].join('\n');
}

export function malformedPatchLine(error: PatchParseError): string {
  return `Malformed patch at line ${String(error.line)}: ${withFinalPeriod(displayPath(error.problem))} ${UNCHANGED}`;
}

export function sectionFailureLine(failure: Extract<ApplySectionsResult, { ok: false }>): string {
  const reason = failure.hunkLine === undefined
    ? escapedReason(failure.reason)
    : `No matching text for hunk starting "${displayPath(failure.hunkLine)}"`;
  return `Patch failed at section ${String(failure.section)} (${displayPath(failure.marker)}): ${withFinalPeriod(reason)} ${UNCHANGED}`;
}

export function applyingFailureLine(outcome: Extract<CommitOutcome, { ok: false }>): string {
  return `Patch failed while applying: ${escapedReason(outcome.reason)}: ${displayPath(outcome.path)}. ${outcome.restored ? UNCHANGED : MAYBE_CHANGED}`;
}
