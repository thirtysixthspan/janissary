// The branch segment shared by every commit-to-origin tooltip (the file navigator's header button
// and the editor's metadata-row icon): the push goes to the checked-out branch's own name on
// `origin`, so naming it tells the reader where the commit will land.
export function commitBranchTooltipSuffix(branch?: string): string {
  return branch ? ` (branch ${branch})` : '';
}
