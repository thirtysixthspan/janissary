import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { janissaryRoot } from './janissary-root.js';

// Asked of git rather than read out of `.gitignore`: a line in the wrong place, or one a later
// negation shadows, would satisfy a text match and still let the file through. `git check-ignore`
// exits 0 when the path is ignored and 1 when it is not, so the exit status is the answer.
function isIgnored(relPath: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], { cwd: janissaryRoot(), stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('.gitignore', () => {
  // The harness writes this while a scheduled task runs, and `pr-commit` stages with `git add -A`,
  // so a scheduled run overlapping a task's commit step would otherwise carry it into master.
  it('ignores the harness\'s scheduling lock file', () => {
    expect(isIgnored('.claude/scheduled_tasks.lock')).toBe(true);
  });

  // The other half of the boundary: `.claude/` also holds the project's own permission allowlist,
  // which is tracked and ships in the package. Broadening the pattern to the directory would hide
  // it, and this is what would notice.
  it('does not ignore the project\'s own .claude/settings.json', () => {
    expect(isIgnored('.claude/settings.json')).toBe(false);
  });
});
