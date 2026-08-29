import type { FilesTabState } from './state.js';

// Recompute one tab's git statuses and current branch off the event loop, then re-render with
// them via `rebuild` (decision 6's second `dirty` emit). Coalesced: if a refresh is already in
// flight for this tab, the request only sets a stale bit and exactly one follow-up runs when the
// current one resolves — no overlapping git processes. The captured `root` guards against a
// mid-flight `reroot` or tab close: a result whose tab is gone or whose root has changed is
// discarded, never written.
export function refreshGit(
  states: Map<string, FilesTabState>,
  label: string,
  rebuild: (label: string) => void,
): void {
  const state = states.get(label);
  if (!state) return;
  if (state.gitRefreshing) { state.gitRefreshStale = true; return; }
  state.gitRefreshing = true;
  const root = state.root;
  state.filesystem.gitMetadata(root, ({ statuses, branch, githubUrl }) => {
    const current = states.get(label);
    if (!current) return;
    if (current.root === root) {
      current.gitStatuses = new Map(statuses);
      current.branch = branch;
      current.githubUrl = githubUrl;
      rebuild(label);
    }
    current.gitRefreshing = false;
    if (current.gitRefreshStale) { current.gitRefreshStale = false; refreshGit(states, label, rebuild); }
  });
}
