import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/research/find-bugs.md` runs unattended and decides what to do next by matching text that
// other code prints: the launcher's timeout message, its readiness marker, the stop command's
// message, the server's refusal to start without a bundle, the config key it writes into a scratch
// project, the build it runs. Reword any of those and nothing fails — the playbook goes on giving
// confident instructions for output that no longer exists, an unattended run misreads a real start
// failure, and the bug it files describes a message the app never printed.
// `scripts/docs-screenshots/task-playbook.test.mjs` exists for the same reason about the other
// unattended task that reads a script's output. These assertions pin the literals an agent matches
// on and nothing else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/research/find-bugs.md');
const plan = read('product/plans/complete/find-bugs-task.md');
const manifest = JSON.parse(read('package.json'));
const browserGuideline = read('ai/guidelines/sandbox-e2e-browser.md');

// [what the playbook relies on, the file that produces it, the literal both must carry]
const APPLICATION_LITERALS = [
  ['the launch message when no URL arrives', read('bin/janus.mjs'), 'failed to start: timed out waiting for the server'],
  ['the marker the launcher waits for', read('bin/janus.mjs'), '__JANUS_URL__'],
  ['the line the server prints once it is up', read('src/main.ts'), '__JANUS_URL__'],
  ['the bundle the server will not start without', read('src/main.ts'), 'web/dist'],
  ['the stop command with nothing left running', read('src/stop-instance.ts'), 'no running janus instance for'],
  ['the config key that disables the nested sandbox', read('src/config.ts'), 'sandboxWorkspaces'],
  ['the same key as the decoder fills it', read('src/config-decode.ts'), 'sandboxWorkspaces'],
];

describe('the find-bugs playbook', () => {
  it.each(APPLICATION_LITERALS)('quotes what %s prints', (_what, source, literal) => {
    expect(source).toContain(literal);
    expect(playbook).toContain(literal);
  });

  it('runs the build the manifest defines, and spells it the way the manifest does', () => {
    expect(manifest.scripts.build).toBe('tsc && npm run build:web');
    expect(playbook).toContain('npm run build');
    expect(playbook).toContain('tsc && npm run build:web');
  });

  it.each(['JANISSARY_BROWSER_WS_ENDPOINT', 'JANISSARY_PLAYWRIGHT'])(
    'gates on %s, which the browser guideline is where a reader looks it up',
    (variable) => {
      expect(playbook).toContain(variable);
      expect(browserGuideline).toContain(variable);
    },
  );

  // The ten report lines are written twice, in the plan and in the playbook, and only the
  // playbook's copy is what a run prints. Both sides are pinned: the plan keeps its list, and the
  // playbook must carry every line of it.
  it('prints the report shape the plan fixes', () => {
    const fixed = [...plan.matchAll(/^- `((?:App|Specs|Not tested|New bugs|Appended|Not filed|Noted|Commit|Stash|Status):.*)`$/gm)]
      .map((match) => match[1]);
    expect(fixed).toHaveLength(10);
    for (const line of fixed) expect(playbook).toContain(line);
  });

  // Both spellings are correct here and mean different things: the project's own runner audits the
  // project's own lockfile, the installation's covers a project that ships no runner. What is
  // never right is a bare `scripts/run.mjs`, which resolves into whatever project the tab is open
  // on and finds no runner there.
  it('anchors every script-runner path to the project or the installation', () => {
    expect(playbook).toContain('./scripts/run.mjs check-malicious-package --audit');
    expect(playbook).toContain('$janissary/scripts/run.mjs check-malicious-package --audit');
    const anchored = playbook
      .replaceAll('$janissary/scripts/run.mjs', '')
      .replaceAll('./scripts/run.mjs', '');
    expect(anchored).not.toContain('scripts/run.mjs');
  });

  it('audits a named lockfile rather than the one beside the runner', () => {
    expect(playbook).toContain('--audit ./package-lock.json');
  });
});
