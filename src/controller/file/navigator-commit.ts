import type { Managers } from '../../managers.js';
import { notify } from '../../notifications/index.js';
import { NOTHING_TO_COMMIT_TEXT } from '../../file-navigator/commit-report.js';

// The `fileNavigatorCommit` RPC's controller entry, in a sibling module rather than in
// `file-navigator.ts`, which re-exports it — that file is already close to the size limit, and this
// is the pattern it already uses for `file-navigator-selection.ts`.
export function fileNavigatorCommit(
  managers: Managers, index: number, message: string, paths: string[],
): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.commit(label, message, paths);
}

// The `fileNavigatorNothingToCommit` RPC's controller entry: the client has already decided the
// tree has nothing to commit — it holds the same changed-count the whole-tree default message is
// generated from — so this only owes the user the notifications line the commit itself would have
// posted, in the commit's own vocabulary.
export function fileNavigatorNothingToCommit(managers: Managers, index: number): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) notify(managers, 'file-operation', label, NOTHING_TO_COMMIT_TEXT);
}
