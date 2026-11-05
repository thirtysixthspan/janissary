import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/work-pull-request-issue.md` takes an explicit pull request reference and then an
// optional work item. The work item is matched against the branch backlog first, and unmatched text
// is fixed as new work without being recorded. These assertions pin that contract and the target
// safeguards it must not loosen: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');
const playbook = read('ai/tasks/feature/work-pull-request-issue.md');
const ordinary = read('ai/tasks/work-an-issue.md');

const between = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to));
const selection = between(playbook, '## Step 1 — ', '## Step 2 — ');
const promotion = between(playbook, '## Step 7 — ', '## Step 8 — ');

describe('the work-pull-request-issue playbook', () => {
  it('takes a pull request reference followed by an optional work item', () => {
    expect(playbook).toContain('`execute ./ai/tasks/feature/work-pull-request-issue.md <number|#number|PR URL> [work item]`');
    expect(ordinary).toContain('`./ai/tasks/feature/work-pull-request-issue.md <number> [work item]`');
  });

  it('still demands an explicit pull request reference', () => {
    expect(playbook).toContain('Never accept a head branch name, infer a target from context, or let the work item stand in for the pull request reference.');
    expect(playbook).toContain('`Reason: explicit pull request number, #number, or PR URL required`');
  });

  it('fixes unmatched text as the work item without recording it', () => {
    expect(selection).toContain('**If no entry matches, the named text is itself the work item**');
    expect(selection).toContain('without stopping and without adding it to the backlog');
  });

  it('still stops on a position that names no entry', () => {
    expect(selection).toContain('a bare position that names no entry');
  });

  it('goes on with a named work item when the branch backlog is missing or empty', () => {
    expect(selection).toContain('When a work item was named, a missing or empty backlog is not a reason to stop');
  });

  it('leaves the branch backlog unchanged when the named work item was not recorded', () => {
    expect(promotion).toContain('If the named work item was not recorded there, leave the backlog unchanged');
  });

  it('still never takes work from the ordinary issues backlog', () => {
    expect(playbook).toContain('7. **Reading or editing `./product/backlog/issues.md`.**');
    expect(playbook).toContain('never fall back to master\'s issues, and never add a named work item to either backlog');
  });
});
