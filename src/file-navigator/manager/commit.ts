import { commitFailureLeavesStagedText, commitFailureText, commitSuccessText, NOTHING_TO_COMMIT_TEXT } from '../commit-report.js';
import { commitLeftStagingInPlace } from '../../git/commit.js';
import { notify } from '../../notifications/index.js';
import { armFlash, commitFlashDescriptor, restFlash, stillRooted } from './flash.js';
import type { MutationContext } from './mutations.js';

// The manager internals a commit needs: the mutating operations' own context, plus the git-metadata
// refresh a landed commit triggers, so rows that were yellow before it stop being yellow after.
// Declared separately from `PullContext` rather than shared with it — a common "git context" type
// for two call sites would be an abstraction with nothing to hold.
export type CommitContext = MutationContext & { refreshGit: (label: string) => void };

// Commit the named tree-relative paths — or everything under the tree's root, for an empty list —
// and push them to `origin`. Every outcome is exactly one notifications-feed line and one flash of
// the header button, which spins while the work runs (the machine behind that is
// `manager-flash.ts`, shared with the pull). The notification is posted whether or not the tab
// survived the commit: the user typed a message and armed the action, so they are owed its outcome
// even if they re-rooted or closed the tree while it ran. Coalesced: a click while one commit is
// still in flight is ignored, since overlapping commits collide on git's index and `HEAD`, and it
// reports nothing because nothing happened — and the same is true of a click while a pull is in
// flight, since a pull collides on the same lockfiles a commit would.
export function runCommit(context: CommitContext, label: string, message: string, paths: string[]): void {
  const state = context.tabs.get(label);
  if (!state || state.commit === 'committing' || state.pull === 'pulling') return;
  armFlash(context, label, commitFlashDescriptor, 'committing');
  void state.filesystem.commit(state.root, message, paths).then((result) => {
    if (!result.committed) {
      // Nothing failed, so the button goes straight back to rest rather than turning red — but the
      // user is still told why nothing happened, unlike a coalesced click, where something is
      // genuinely still running.
      notify(context.managers, 'file-operation', label, NOTHING_TO_COMMIT_TEXT);
      restFlash(context, label, commitFlashDescriptor);
      return;
    }
    notify(context.managers, 'file-operation', label, commitSuccessText(result.summary));
    armFlash(context, label, commitFlashDescriptor, 'committed');
    if (stillRooted(context, label, state.root)) context.refreshGit(label);
  }, (error: unknown) => {
    const text = commitLeftStagingInPlace(error) ? commitFailureLeavesStagedText(error) : commitFailureText(error);
    notify(context.managers, 'file-operation', label, text);
    armFlash(context, label, commitFlashDescriptor, 'error');
  });
}
