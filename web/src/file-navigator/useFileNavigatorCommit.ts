import { useState } from 'react';
import { defaultCommitMessage } from './file-navigator-commit-message';

// What the commit-message field is currently open over: the paths the commit will name (empty for
// the header button's whole-tree form) and the text it opened pre-filled with.
export type PendingCommit = { paths: string[]; defaultMessage: string };

// Owns the commit-message field's pending state and hands what it produces to the commit intent.
// Both entry points — the header button and the row menu's `Commit to origin` — open the same field;
// only the pre-filled text and the paths that travel with the RPC differ.
export function useFileNavigatorCommit(commit: (message: string, paths: string[]) => void) {
  const [pendingCommit, setPendingCommit] = useState<PendingCommit | null>(null);

  // `paths` is what the commit names; `defaultMessage` is what the field opens pre-filled with,
  // defaulting to naming those same paths. The header button's whole-tree form is the one caller that
  // supplies its own — a count of every change under the tree's root, which has no filename to derive
  // a path-based default from.
  const request = (paths: string[], defaultMessage: string = defaultCommitMessage(paths)) => {
    setPendingCommit({ paths, defaultMessage });
  };

  // The field has already decided the message is worth sending — an empty one cancels there rather
  // than arriving here.
  const confirm = (message: string) => {
    if (pendingCommit) commit(message, pendingCommit.paths);
    setPendingCommit(null);
  };

  return { pendingCommit, request, confirm, cancel: () => setPendingCommit(null) };
}
