import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/planning/rate-plan-complexity.md` is the single home of the 1-10 complexity scale. The two
// improvement tasks delegate their Step 5 to the quantitative rating task and skip its Step 0 and Step 1 by heading, so a
// renamed heading, or a band copied back into a caller, would leave the delegation pointing at
// nothing or the scale split across files and still read fine. These assertions pin the delegation
// wording, the headings it names, and the scale's single location, and nothing else.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const RATING_TASK = 'ai/tasks/planning/rate-plan-complexity.md';
const CALLER_RATING_TASK = 'ai/tasks/planning/rate-plan-complexity-quantitative.md';
const CALLERS =['improve-plan.md', 'improve-plan-with-minimalism.md'];
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const PICK_STEP = 'Step 1 — Pick the plan';
const PREPARE = 'Execute `ai/tasks/workspace/prepare-workspace.md` in full';
const BANDS = [
  '- **1–2** — one small module or pure wiring; no new protocol/persistence/UI surface. (`cli-help-version`, `prompt-click-prefill` are 2s.)',
  '- **3–4** — small feature, but correctness depends on catching several call sites or coordinating with other plans; or it spans server and web with a new RPC or persistence field. (`unread-badge` is a 3, `tab-name-alias` a 4.)',
  '- **5–7** — a new subsystem or protocol surface, many touched files, real state-machine or concurrency reasoning.',
  '- **8–9** — a major feature: multiple new modules on both sides, novel interaction logic, first-of-its-kind surface in the app. (`editor-tab` is a 9.)',
  '- **10** — architecture-level overhaul touching most of the system.',
];

const rating = read(RATING_TASK);

describe('the rate-plan-complexity task', () => {
  it('prepares the workspace in its own Step 0 and picks the plan in its own Step 1', () => {
    const step = rating.indexOf(`## ${PREPARE_STEP}`);
    expect(step).toBeGreaterThan(-1);
    expect(rating.indexOf(PREPARE)).toBeGreaterThan(step);
    expect(rating.indexOf(`## ${PICK_STEP}`)).toBeGreaterThan(step);
  });

  it('carries every calibration band exactly once', () => {
    for (const band of BANDS) {
      expect(rating.split(band)).toHaveLength(2);
    }
  });

  it('records the complexity line format callers rely on', () => {
    expect(rating).toContain('**Complexity: N/10** — <one-line rationale naming what drives the number>');
  });

  it('names only ai/ files that exist', () => {
    const paths = new Set([...rating.matchAll(/`(ai\/[^`\s*]+\.md)`/g)].map((match) => match[1]));
    expect([...paths].filter((relative) => !existsSync(path.join(repoRoot, relative)))).toEqual([]);
  });
});

describe.each(CALLERS)('%s', (task) => {
  const caller = read(`ai/tasks/planning/${task}`);

  it('delegates its rating to the rating task, skipping Step 0 and Step 1', () => {
    expect(caller).toContain(
      `Open \`${CALLER_RATING_TASK}\` and execute every step in order, except \`${PREPARE_STEP}\` and \`${PICK_STEP}\``,
    );
  });

  it('keeps no calibration band of its own', () => {
    for (const band of BANDS) {
      expect(caller).not.toContain(band);
    }
  });
});
