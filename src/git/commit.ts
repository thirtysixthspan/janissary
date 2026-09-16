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
export async function commitRoot(
  root: string, message: string, absolutePaths: string[],
): Promise<CommitResult> {
  await stage(root, absolutePaths);
  if (!await hasStagedChanges(root)) return { committed: false };
  const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: root });
  await pullRebase(root);
  await execFileAsync('git', ['push'], { cwd: root });
  return { committed: true, summary: pullSummary(stdout) };
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

// The bare `git pull --rebase` names no remote and no branch for the reason `pullRoot` gives: the
// navigator's root is an arbitrary checkout, and the branch's configured upstream is what should
// decide. On a branch with no upstream this is what fails, before the commit has been pushed
// anywhere, and git's own error — which already names the `--set-upstream` command that fixes it —
// is what the caller reports. Nothing here configures an upstream. A rebase that fails after
// starting is abandoned so the branch is left as it was, and the original error still surfaces.
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
