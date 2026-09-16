import type { FileNavigatorRow } from '@shared/protocol';
import { basename } from '../shared/rel-path';

// Pure helpers for the commit-message field — what it opens pre-filled with, and whether what the
// user left in it is worth sending. Kept out of the component so both are testable without a render,
// the way `file-navigator-rename.ts` holds the rename field's own rules.

// The text the field opens with. A single file is named outright, since that is the common case and
// the one where a generated message is actually informative; anything else is counted. Follows
// `sync: <filename>`, this codebase's established shape for a generated commit message, with its own
// verb.
export function defaultCommitMessage(paths: string[]): string {
  return paths.length === 1 ? `commit: ${basename(paths[0])}` : `commit: ${paths.length} files`;
}

// The changed files the tree is currently showing — what the header button's whole-tree form names
// its default message after. Directory rows are excluded: their status is the roll-up of what lies
// beneath them, so counting both would count the same change twice.
export function changedFilePaths(rows: FileNavigatorRow[]): string[] {
  return rows.filter((row) => !row.dir && row.gitStatus !== undefined).map((row) => row.path);
}

// An empty or whitespace-only message cancels rather than committing — the same silent no-op the
// rename field applies to a name the user emptied out.
export function committableMessage(raw: string): string | undefined {
  return raw.trim() || undefined;
}
