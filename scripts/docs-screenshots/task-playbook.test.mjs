import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `ai/tasks/take-documentation-screenshots.md` runs unattended, and it decides what to do next by
// matching the lines this pipeline prints: a skip is a success to carry into the report, a failure
// earns exactly one retry, a missing bundle is a build away. Reword a message in
// `docs-screenshots.mjs` and nothing fails — the playbook just goes on giving confident instructions
// for an output that no longer exists. These assertions pin only the literals an agent matches on,
// not prose or structure.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/take-documentation-screenshots.md');
const runner = read('scripts/docs-screenshots.mjs');
const browser = read('scripts/docs-screenshots/browser.mjs');
const packageScripts = JSON.parse(read('package.json')).scripts;

// One outcome line per row: the fixed part the script prints around its interpolation, and the form
// the playbook's outcome table quotes for a reader to match against. Both sides are pinned, because
// either drifting alone is what turns the table into wrong instructions.
const OUTCOME_LINES = [
  { printed: 'Driving ', quoted: '`Driving attached janissary browser at <endpoint>`' },
  { printed: 'OK   ', quoted: '`OK <name>`' },
  { printed: 'SKIP ', quoted: '`SKIP <name> — needs "<binary>" on PATH' },
  { printed: 'FAIL ', quoted: '`FAIL <name>: <reason>`' },
  { printed: 'Skipped (binary unavailable): ', quoted: '`Skipped (binary unavailable):`' },
  { printed: 'Failed: ', quoted: '`Failed: <names>`' },
];

const BUNDLE_MISSING = 'Web bundle missing — run `npm run build:web` first (screenshots capture the built UI).';
const NO_MATCHING_ENTRIES = 'No manifest entries match: ';
const NO_BROWSER = 'No browser to drive: ';
const SKIP_SUFFIX = '" on PATH; capture it manually and commit the PNG.';
const OUTPUT_DIRECTORY = 'documentation/public/screenshots/';

describe('take-documentation-screenshots playbook', () => {
  it.each(OUTCOME_LINES)('quotes $quoted, which the run still prints', ({ printed, quoted }) => {
    expect(runner).toContain(printed);
    expect(playbook).toContain(quoted);
  });

  // `Driving` alone says nothing; the playbook tells the agent to stop unless the source named after
  // it is the attached browser, and that phrase is composed in browser.mjs rather than the runner.
  it('names the attached-browser source phrase the run prints after "Driving"', () => {
    expect(browser).toContain('attached janissary browser at ');
    expect(playbook).toContain('attached janissary browser at ');
  });

  it('quotes the bundle-missing stop verbatim', () => {
    expect(runner).toContain(BUNDLE_MISSING);
    expect(playbook).toContain(BUNDLE_MISSING);
  });

  it('quotes the no-matching-entries stop verbatim', () => {
    expect(runner).toContain(NO_MATCHING_ENTRIES);
    expect(playbook).toContain(NO_MATCHING_ENTRIES);
  });

  it('quotes the unacquirable-browser stop verbatim', () => {
    expect(runner).toContain(NO_BROWSER);
    expect(playbook).toContain(NO_BROWSER);
  });

  // The playbook calls a skip a success to be carried into the report, which is only safe advice
  // while the message still ends by telling the reader to capture that one by hand.
  it('quotes the skip line\'s instruction verbatim', () => {
    expect(runner).toContain(SKIP_SUFFIX);
    expect(playbook).toContain(SKIP_SUFFIX);
  });

  it('gates on the two variables the pipeline reads for an attached browser', () => {
    for (const variable of ['JANISSARY_BROWSER_WS_ENDPOINT', 'JANISSARY_PLAYWRIGHT']) {
      expect(browser).toContain(`env.${variable}`);
      expect(playbook).toContain(variable);
    }
  });

  // Step 6 decides what to ship by path, so a moved output directory would have it revert exactly
  // the files it was supposed to commit.
  it('names the directory the run actually writes to', () => {
    expect(runner).toContain("'documentation', 'public', 'screenshots'");
    expect(playbook).toContain(OUTPUT_DIRECTORY);
  });

  it('names a real script-runner target and a real npm script', () => {
    expect(playbook).toContain('./scripts/run.mjs docs-screenshots');
    expect(existsSync(path.join(repoRoot, 'scripts', 'docs-screenshots.mjs'))).toBe(true);
    expect(playbook).toContain('npm run build:web');
    expect(packageScripts['build:web']).toBeDefined();
  });
});
