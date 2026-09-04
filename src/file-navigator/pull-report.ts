import { errorText } from '../error-text.js';

// The two notifications-feed lines a file navigator pull can produce, written together so the pair
// stays consistent. They are not part of `operation-report.ts`, which reports a `BatchResult`'s
// per-path failures — a pull acts on the whole tree at once and has neither a path list nor a total.

// A pull that finished. `summary` is git's own outcome (`Already up to date.`, or the diffstat total
// of what came down); an empty one — git printed nothing to stdout — degrades to the bare statement
// that the pull ran.
export function pullSuccessText(summary: string): string {
  return summary ? `Pulled from origin: ${summary}` : 'Pulled from origin';
}

// A pull that failed, carrying git's own error text.
export function pullFailureText(error: unknown): string {
  return `Could not pull: ${errorText(error)}`;
}
