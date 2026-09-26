import { basename } from '../../shared/rel-path';

// Pure helpers for the commit-message field — what it opens pre-filled with, and whether what the
// user left in it is worth sending. Kept out of the component so both are testable without a render,
// the way `file-navigator-rename.ts` holds the rename field's own rules.

// The text the field opens with. A single file is named outright, since that is the common case and
// the one where a generated message is actually informative; anything else is counted. Uses
// `sync: <filename>`, this codebase's established shape for a generated commit message
// (`src/git/sync.ts:98`).
export function defaultCommitMessage(paths: string[]): string {
  return paths.length === 1 ? `sync: ${basename(paths[0])}` : `sync: ${paths.length} files`;
}

// The header button's whole-tree default: named after every change under the tree's root, which the
// server counts (`changedCount` on the payload), rather than after only the rows currently rendered.
// A count has no filename to name, so even a single change reads as `sync: 1 file` rather than
// naming it outright — unlike `defaultCommitMessage`, which the row menu's named selection still uses.
export function defaultCommitMessageForCount(count: number): string {
  return count === 1 ? 'sync: 1 file' : `sync: ${count} files`;
}

// An empty or whitespace-only message cancels rather than committing — the same silent no-op the
// rename field applies to a name the user emptied out.
export function committableMessage(raw: string): string | undefined {
  return raw.trim() || undefined;
}
