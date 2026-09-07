import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// `git pull` writes its progress to stderr and its outcome to stdout: the single line `Already up to
// date.` when there was nothing to take, otherwise a merge or fast-forward report whose last line is
// the diffstat total (`3 files changed, 12 insertions(+), 4 deletions(-)`). The last non-empty line
// is therefore the most informative sentence in both cases, and getting it needs no knowledge of
// git's output format beyond that.
export function pullSummary(stdout: string): string {
  const lines = stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  return lines.at(-1) ?? '';
}

// Pull the latest from `origin` into the repository containing `root` — the file navigator header's
// pull button (see the plan). Unlike the status queries in `git-status.ts`, which quietly degrade to
// empty answers outside a repository, a pull the user explicitly asked for must be able to fail
// loudly: the promise rejects with git's own error so the caller can report it. The button only
// renders where the tree already shows a branch, and the branch's configured upstream (or git's
// default remote resolution) decides what `git pull` actually does — no arguments are forced here.
// Resolves with git's own outcome summary so the caller can report what the pull actually did.
export async function pullRoot(root: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['pull'], { cwd: root });
  return pullSummary(stdout);
}
