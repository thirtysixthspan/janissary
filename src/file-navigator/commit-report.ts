import { errorText } from '../error-text.js';

// The three notifications-feed lines a file navigator commit can produce, written together so the
// set stays consistent — the same shape `pull-report.ts` holds for the pull, and for the same
// reason: a commit acts on the whole tree or on a named selection at once, so it has neither the
// per-path failure list nor the total that `operation-report.ts` reports.

// A commit that landed. `summary` is git's own account of it (the diffstat total under the
// `[branch abc1234] <message>` header); an empty one — git printed nothing to stdout — degrades to
// the bare statement that the commit ran.
export function commitSuccessText(summary: string): string {
  return summary ? `Committed to origin: ${summary}` : 'Committed to origin';
}

// A commit that failed, carrying git's own error text.
export function commitFailureText(error: unknown): string {
  return `Could not commit: ${errorText(error)}`;
}

// Nothing was staged, so nothing was committed. Neither of the other two outcomes, so it borrows
// neither stem — the notification's own provenance header already names the tab it came from.
export const NOTHING_TO_COMMIT_TEXT = 'Nothing to commit';
