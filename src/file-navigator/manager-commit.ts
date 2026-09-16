import { commitFailureLeavesStagedText, commitFailureText, commitSuccessText, NOTHING_TO_COMMIT_TEXT } from './commit-report.js';
import { commitLeftStagingInPlace } from '../git/commit.js';
import { notify } from '../notifications.js';
import type { MutationContext } from './manager-mutations.js';
import type { FileNavigatorCommitStatus } from '../tab/types.js';

// How long a settled commit's success or failure stays on the header button before it returns to
// rest — the same window `manager-pull.ts` uses, for the same reason: a commit and push runs long
// enough that the user may well have looked away while it did.
const FLASH_MS = 3000;

// The manager internals a commit needs: the mutating operations' own context, plus the git-metadata
// refresh a landed commit triggers, so rows that were yellow before it stop being yellow after.
// Declared separately from `PullContext` rather than shared with it — a common "git context" type
// for two call sites would be an abstraction with nothing to hold.
export type CommitContext = MutationContext & { refreshGit: (label: string) => void };

// Commit the named tree-relative paths — or everything under the tree's root, for an empty list —
// and push them to `origin`. Every outcome is exactly one notifications-feed line and one flash of
// the header button, which spins while the work runs. The notification is posted whether or not the
// tab survived the commit: the user typed a message and armed the action, so they are owed its
// outcome even if they re-rooted or closed the tree while it ran. Coalesced: a click while one
// commit is still in flight is ignored, since overlapping commits collide on git's index and
// `HEAD`, and it reports nothing because nothing happened — and the same is true of a click while a
// pull is in flight, since a pull collides on the same lockfiles a commit would.
export function runCommit(context: CommitContext, label: string, message: string, paths: string[]): void {
  const state = context.tabs.get(label);
  if (!state || state.commit === 'committing' || state.pull === 'pulling') return;
  if (state.commitFlash) clearTimeout(state.commitFlash);
  state.commitFlash = undefined;
  state.commit = 'committing';
  context.rebuild(label);
  const root = state.root;
  void state.filesystem.commit(root, message, paths).then((result) => {
    if (!result.committed) {
      // Nothing failed, so the button goes straight back to rest rather than turning red — but the
      // user is still told why nothing happened, unlike a coalesced click, where something is
      // genuinely still running.
      notify(context.managers, 'file-operation', label, NOTHING_TO_COMMIT_TEXT);
      rest(context, label);
      return;
    }
    notify(context.managers, 'file-operation', label, commitSuccessText(result.summary));
    settle(context, label, 'committed');
    if (stillRooted(context, label, root)) context.refreshGit(label);
  }, (error: unknown) => {
    const text = commitLeftStagingInPlace(error) ? commitFailureLeavesStagedText(error) : commitFailureText(error);
    notify(context.managers, 'file-operation', label, text);
    settle(context, label, 'error');
  });
}

// Whether the tab is still the one that started the commit — a tree closed or re-rooted mid-commit
// keeps whatever it holds now rather than having another root's git metadata refreshed onto it.
function stillRooted(context: CommitContext, label: string, root: string): boolean {
  const current = context.tabs.get(label);
  return current !== undefined && current.root === root;
}

// Show the outcome on the button, redraw once, and arm the timer that returns it to rest. A tab that
// closed mid-commit has nothing left to show it on.
function settle(context: CommitContext, label: string, status: FileNavigatorCommitStatus): void {
  const state = context.tabs.get(label);
  if (!state) return;
  state.commit = status;
  context.rebuild(label);
  state.commitFlash = setTimeout(() => rest(context, label), FLASH_MS);
}

function rest(context: CommitContext, label: string): void {
  const state = context.tabs.get(label);
  if (!state) return;
  state.commitFlash = undefined;
  state.commit = undefined;
  context.rebuild(label);
}
