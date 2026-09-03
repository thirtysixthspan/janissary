import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Pull the latest from `origin` into the repository containing `root` — the file navigator header's
// pull button (see the plan). Unlike the status queries in `git-status.ts`, which quietly degrade to
// empty answers outside a repository, a pull the user explicitly asked for must be able to fail
// loudly: the promise rejects with git's own error so the caller can report it. The button only
// renders where the tree already shows a branch, and the branch's configured upstream (or git's
// default remote resolution) decides what `git pull` actually does — no arguments are forced here.
export async function pullRoot(root: string): Promise<void> {
  await execFileAsync('git', ['pull'], { cwd: root });
}
