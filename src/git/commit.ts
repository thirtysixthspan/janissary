import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pullSummary } from './pull.js';

const execFileAsync = promisify(execFile);

// What a commit-and-push cycle answers with. `committed: false` is the nothing-to-commit case — a
// clean tree, or a selection whose files are all unchanged — which is an outcome rather than a
// failure, so it is a value here and not a rejection: the button returns to rest and the user is
// told why nothing happened. `summary` is git's own account of the commit.
export type CommitResult = { committed: true; summary: string } | { committed: false };

// Stage, commit, rebase onto whatever `origin` has moved to, and push — the file navigator's commit
// button and its `Commit to origin` menu entry. Like `pullRoot`, and unlike the status queries in
// `status.ts`, this is an action the user explicitly armed, so it rejects with git's own error
// rather than degrading quietly.
//
// The tree's root is the user's own checkout with the user's own credential helpers, so this runs
// with the server's own environment: a push from here authenticates exactly as `git push` typed in a
// terminal there would. `GitSync`'s `GH_TOKEN` injection is deliberately not copied — it exists
// because the shared `git-sync` clone has its `origin` rewritten to HTTPS and its credential helper
// replaced during provisioning, which is true of a provisioned workspace and not of an arbitrary
// tree root.
//
// `absolutePaths` are the already-contained paths to stage; an empty list is the header button's
// whole-tree form. Resolves with the last non-empty line of the commit's stdout — `pullSummary` is
// nothing more than that, so it is imported rather than written a second time here.
//
// A `git commit` that rejects must not leave staging behind that the action itself put there: the
// index is probed once before `stage` runs, so a rejection can tell whether everything now staged is
// this action's own doing (nothing was staged before it touched the tree) or partly the user's own
// prior work. Only the former is unwound — resetting an index that already held the user's own
// staging would destroy that instead of protecting it, so that case is left alone and the error is
// flagged for `commitLeftStagingInPlace` instead. Once `git commit` itself has succeeded a real commit
// object exists, so a `pull --rebase` or `push` failure after that point is never unwound: there is a
// real, inspectable commit by then, and reporting the error untouched is already correct.
export async function commitRoot(
  root: string, message: string, absolutePaths: string[],
): Promise<CommitResult> {
  const wasAlreadyStaged = await hasStagedChanges(root);
  await stage(root, absolutePaths);
  if (!await hasStagedChanges(root)) return { committed: false };
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: root }));
  } catch (error) {
    if (wasAlreadyStaged) markStagingLeftInPlace(error);
    else await unstage(root);
    throw error;
  }
  if (await hasUpstream(root)) {
    await pullRebase(root);
    await execFileAsync('git', ['push', 'origin', 'HEAD'], { cwd: root });
  } else {
    const branch = await currentBranch(root);
    await execFileAsync('git', ['push', '--set-upstream', 'origin', branch], { cwd: root });
  }
  return { committed: true, summary: pullSummary(stdout) };
}

// Errors thrown by a failed `git commit` whose index was already dirty before this action staged
// anything — reset would destroy the user's own prior staging, so nothing is unwound and the caller
// is told to report that instead. A `WeakSet` keyed on the thrown error itself, rather than a property
// written onto it or a dedicated error class, so the object crossing back to the caller is untouched.
const stagingLeftInPlace = new WeakSet<object>();

function markStagingLeftInPlace(error: unknown): void {
  if (typeof error === 'object' && error !== null) stagingLeftInPlace.add(error);
}

export function commitLeftStagingInPlace(error: unknown): boolean {
  return typeof error === 'object' && error !== null && stagingLeftInPlace.has(error);
}

// Puts an index that this action staged back the way it found it, after `git commit` rejected.
// Swallows a failing reset the way `pullRebase` below already swallows a failing `git rebase
// --abort`: the original commit error is what the caller needs, not a second failure about undoing.
async function unstage(root: string): Promise<void> {
  try {
    await execFileAsync('git', ['reset'], { cwd: root });
  } catch { /* nothing more to do if the reset itself fails */ }
}

// The `-- .` pathspec is load-bearing for the whole-tree form: since git 2.0 a bare `git add -A`
// updates the *entire repository* regardless of the working directory, so a navigator rooted at a
// subdirectory would commit changes the tree never showed. Scoping to `.` under `cwd` makes the
// button commit exactly what the tree displays — the same scoping, for the same reason, that
// `changedPaths` uses to decide which rows to colour.
async function stage(root: string, absolutePaths: string[]): Promise<void> {
  const pathspec = absolutePaths.length > 0 ? absolutePaths : ['.'];
  await execFileAsync('git', ['add', '-A', '--', ...pathspec], { cwd: root });
}

// `git diff --cached --quiet` exits 0 when nothing is staged and non-zero otherwise.
async function hasStagedChanges(root: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: root });
    return false;
  } catch {
    return true;
  }
}

// Whether the current branch already has a configured upstream. `commitRoot` uses this to decide
// whether there is anything to rebase against before it pushes: a branch with no upstream has
// nothing on `origin` yet, so a `git pull --rebase` first would only reproduce the "no upstream
// branch" failure this check exists to route around.
async function hasUpstream(root: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

// The name of the branch actually checked out, read fresh rather than assumed, so a first-time
// publish always names the branch the tree is on — never `master`, never a name inferred from
// anywhere else.
async function currentBranch(root: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
  return stdout.trim();
}

// The bare `git pull --rebase` names no remote and no branch for the reason `pullRoot` gives: the
// navigator's root is an arbitrary checkout, and the branch's configured upstream is what should
// decide the rebase source. Publishing intentionally differs: it always sends HEAD to the matching
// branch name on origin, even when the configured upstream has another name. A rebase that fails
// after starting is abandoned so the branch is left as it was, and the original error still surfaces.
async function pullRebase(root: string): Promise<void> {
  try {
    await execFileAsync('git', ['pull', '--rebase'], { cwd: root });
  } catch (error) {
    try {
      await execFileAsync('git', ['rebase', '--abort'], { cwd: root });
    } catch { /* no rebase was in progress to abort */ }
    throw error;
  }
}
