import { clearFilesystemCache } from './filesystem-cache.js';
import { pullFailureText, pullSuccessText } from './pull-report.js';
import { notify } from '../notifications/index.js';
import { stillRooted, armFlash, pullFlashDescriptor } from './manager-flash.js';
import type { MutationContext } from './manager-mutations.js';

// The manager internals a pull needs: the mutating operations' own context, plus the git-metadata
// refresh a successful pull triggers, which no mutation needs.
export type PullContext = MutationContext & { refreshGit: (label: string) => void };

// Pull the tree root's repository up to date from `origin` (the header's pull button), then refresh
// the whole view: a pull can change any watched directory, so the listing cache is dropped wholesale
// and both the rows and the git metadata are recomputed rather than left to the debounced watchers a
// git-driven replace may not deliver. Either outcome is one notifications-feed line — git's own
// summary of what came down, or its error, in which case the tree is left exactly as it was — and
// one flash of the header button, which spins while the pull runs (the machine behind that is
// `manager-flash.ts`, shared with the commit). The notification is posted whether or not the tab
// survived the pull: the user armed it and is owed its outcome even if they re-rooted or closed the
// tree while it ran. Coalesced: a click while one pull is still in flight is ignored, since
// overlapping `git pull`s collide on git's lockfiles, and it reports nothing because nothing
// happened — and the same is true of a click while a commit is in flight, since a commit collides
// on the same lockfiles a pull would.
export function runPull(context: PullContext, label: string): void {
  const state = context.tabs.get(label);
  if (!state || state.pull === 'pulling' || state.commit === 'committing') return;
  armFlash(context, label, pullFlashDescriptor, 'pulling');
  const root = state.root;
  void state.filesystem.pull(root).then((summary) => {
    notify(context.managers, 'file-operation', label, pullSuccessText(summary));
    const refreshed = invalidateAfterPull(context, label, root);
    armFlash(context, label, pullFlashDescriptor, 'pulled');
    if (refreshed) context.refreshGit(label);
  }, (error: unknown) => {
    notify(context.managers, 'file-operation', label, pullFailureText(error));
    armFlash(context, label, pullFlashDescriptor, 'error');
  });
}

// Empty the tab's cached listings so the rebuild that follows re-reads what the pull changed. The
// clear also disowns any read that was already in flight, so a listing read before the pull landed
// cannot resolve afterwards and put the pre-pull contents back on screen. Answers whether the tab
// is still the one that started the pull — a tree closed or re-rooted mid-pull keeps whatever it
// holds now.
function invalidateAfterPull(context: PullContext, label: string, root: string): boolean {
  if (!stillRooted(context, label, root)) return false;
  const state = context.tabs.get(label)!;
  clearFilesystemCache(state);
  return true;
}
