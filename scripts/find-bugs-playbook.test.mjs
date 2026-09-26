import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/research/find-bugs.md` runs unattended and decides what to do next by matching text that
// other code prints: the stop command's message when there is nothing left to stop, and the two
// browser variables it gates on. Reword any of those and nothing fails — the playbook goes on giving
// confident instructions for output that no longer exists, and an unattended run misreads a real
// failure. The same hazard, for a much larger set of literals, is what
// `scripts/docs-screenshots/task-playbook.test.mjs` pins for the other unattended task that reads a
// script's output. These assertions pin what the playbook still quotes and nothing else: not prose,
// not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/research/find-bugs.md');
const preparation = read('ai/tasks/workspace/prepare-workspace.md');
const plan = read('product/plans/complete/find-bugs-task.md');
const browserGuideline = read('ai/guidelines/sandbox-e2e-browser.md');

// [what the playbook relies on, the file that produces it, the literal both must carry]
const APPLICATION_LITERALS = [
  ['the stop command with nothing left running', read('src/stop-instance.ts'), 'no running janus instance for'],
];

describe('the find-bugs playbook', () => {
  it.each(APPLICATION_LITERALS)('quotes what %s prints', (_what, source, literal) => {
    expect(source).toContain(literal);
    expect(playbook).toContain(literal);
  });

  it.each(['JANISSARY_BROWSER_WS_ENDPOINT', 'JANISSARY_PLAYWRIGHT'])(
    'gates on %s, which the browser guideline is where a reader looks it up',
    (variable) => {
      expect(playbook).toContain(variable);
      expect(browserGuideline).toContain(variable);
    },
  );

  // The nine report lines are written twice, in the plan and in the playbook, and only the
  // playbook's copy is what a run prints. Both sides are pinned: the plan keeps its list, and the
  // playbook must carry every line of it.
  it('prints the report shape the plan fixes', () => {
    const fixed = [...plan.matchAll(/^- `((?:App|Specs|Not tested|New bugs|Appended|Not filed|Noted|Commit|Status):.*)`$/gm)]
      .map((match) => match[1]);
    expect(fixed).toHaveLength(9);
    for (const line of fixed) expect(playbook).toContain(line);
  });

  // The install, and the gate that guards it, belong to the workspace preparation task the run
  // executes. Both runner spellings are correct and mean different things there: the project's own
  // runner audits the project's own lockfile, the installation's covers a project that ships no
  // runner. What is never right is a bare `scripts/run.mjs`, which resolves into whatever project
  // the tab is open on and finds no runner there.
  it('audits a named lockfile through an anchored runner, in the preparation task', () => {
    expect(preparation).toContain('./scripts/run.mjs check-malicious-package --audit ./package-lock.json');
    expect(preparation).toContain('$janissary/scripts/run.mjs check-malicious-package --audit');
    for (const file of [playbook, preparation]) {
      const anchored = file
        .replaceAll('$janissary/scripts/run.mjs', '')
        .replaceAll('./scripts/run.mjs', '');
      expect(anchored).not.toContain('scripts/run.mjs');
    }
  });

  it('delegates the workspace setup to the preparation task', () => {
    expect(playbook).toContain('ai/tasks/workspace/prepare-workspace.md');
    expect(playbook).toContain('$janissary/ai/tasks/workspace/prepare-workspace.md');
  });
});
