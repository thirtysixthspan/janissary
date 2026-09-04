import { clearFilesystemCache } from './filesystem-cache.js';
import { pullFailureText, pullSuccessText } from './pull-report.js';
import { notify } from '../notifications.js';
import type { MutationContext } from './manager-mutations.js';
import type { FileNavigatorPullStatus } from '../tab/types.js';

// How long a settled pull's success or failure stays on the header button before it returns to rest.
// Longer than the editor's 1.5-second "Saved" flash because a pull runs long enough that the user
// may well have looked away while it did.
const FLASH_MS = 3000;

// The manager internals a pull needs: the mutating operations' own context, plus the git-metadata
// refresh a successful pull triggers, which no mutation needs.
export type PullContext = MutationContext & { refreshGit: (label: string) => void };

// Pull the tree root's repository up to date from `origin` (the header's pull button), then refresh
// the whole view: a pull can change any watched directory, so the listing cache is dropped wholesale
// and both the rows and the git metadata are recomputed rather than left to the debounced watchers a
// git-driven replace may not deliver. Either outcome is one notifications-feed line — git's own
// summary of what came down, or its error, in which case the tree is left exactly as it was — and
// one flash of the header button, which spins while the pull runs. The notification is posted
// whether or not the tab survived the pull: the user armed it and is owed its outcome even if they
// re-rooted or closed the tree while it ran. Coalesced: a click while one pull is still in flight is
// ignored, since overlapping `git pull`s collide on git's lockfiles, and it reports nothing because
// nothing happened.
export function runPull(context: PullContext, label: string): void {
  const state = context.tabs.get(label);
  if (!state || state.pull === 'pulling') return;
  if (state.pullFlash) clearTimeout(state.pullFlash);
  state.pullFlash = undefined;
  state.pull = 'pulling';
  context.rebuild(label);
  const root = state.root;
  void state.filesystem.pull(root).then((summary) => {
    notify(context.managers, 'file-operation', label, pullSuccessText(summary));
    const refreshed = invalidateAfterPull(context, label, root);
    settle(context, label, 'pulled');
    if (refreshed) context.refreshGit(label);
  }, (error: unknown) => {
    notify(context.managers, 'file-operation', label, pullFailureText(error));
    settle(context, label, 'error');
  });
}

// Empty the tab's cached listings so the rebuild that follows re-reads what the pull changed.
// Answers whether the tab is still the one that started the pull — a tree closed or re-rooted
// mid-pull keeps whatever it holds now.
function invalidateAfterPull(context: PullContext, label: string, root: string): boolean {
  const current = context.tabs.get(label);
  if (!current || current.root !== root) return false;
  clearFilesystemCache(current);
  return true;
}

// Show the outcome on the button, redraw once, and arm the timer that returns it to rest. A tab that
// closed mid-pull has nothing left to show it on.
function settle(context: PullContext, label: string, status: FileNavigatorPullStatus): void {
  const state = context.tabs.get(label);
  if (!state) return;
  state.pull = status;
  context.rebuild(label);
  state.pullFlash = setTimeout(() => rest(context, label), FLASH_MS);
}

function rest(context: PullContext, label: string): void {
  const state = context.tabs.get(label);
  if (!state) return;
  state.pullFlash = undefined;
  state.pull = undefined;
  context.rebuild(label);
}
