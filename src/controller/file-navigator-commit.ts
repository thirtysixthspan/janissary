import type { Managers } from '../managers.js';

// The `fileNavigatorCommit` RPC's controller entry, in a sibling module rather than in
// `file-navigator.ts`, which re-exports it — that file is already close to the size limit, and this
// is the pattern it already uses for `file-navigator-selection.ts`.
export function fileNavigatorCommit(
  managers: Managers, index: number, message: string, paths: string[],
): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.commit(label, message, paths);
}
