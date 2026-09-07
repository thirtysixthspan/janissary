import { describe, expect, it } from 'vitest';
import { collectProfileProblems } from './schema.js';
import type { ProfileTabFile } from './types.js';

// A minimal valid entry per tab kind. `TAB_KINDS` is keyed by `ProfileTabFile['type']`, so a
// twelfth kind fails to compile in `schema.ts` — this is the runtime half: every kind the table
// declares is actually accepted and dispatched to its own checker, rather than being listed and
// then rejected.
const MINIMAL: Record<ProfileTabFile['type'], Record<string, unknown>> = {
  agent: { type: 'agent', name: 'one' },
  harness: { type: 'harness', name: 'one', tool: 'claude' },
  editor: { type: 'editor', path: 'README.md' },
  files: { type: 'files' },
  notifications: { type: 'notifications' },
  schedules: { type: 'schedules' },
  plugin: { type: 'plugin', id: 'video' },
  image: { type: 'image', path: 'a.png' },
  markdown: { type: 'markdown', path: 'a.md' },
  page: { type: 'page', url: 'https://example.com' },
  ssh: { type: 'ssh', destination: 'build-box' },
};

// The kinds that occupy a place in the tab strip and so carry the flat presentation fields — the
// nine the separate hand-kept `Set` used to restate. Checked through observable behavior: a bad
// `number` is a problem only where presentation fields apply.
const PRESENTATION_KINDS = new Set(['agent', 'harness', 'editor', 'files', 'plugin', 'image', 'markdown', 'page', 'ssh']);

const entries = Object.entries(MINIMAL) as Array<[ProfileTabFile['type'], Record<string, unknown>]>;

describe('tabProblems over every declared tab kind', () => {
  it.each(entries)('accepts a minimal %s entry', (_kind, tab) => {
    expect(collectProfileProblems({ tabs: [tab] })).toEqual([]);
  });

  it.each(entries)('checks the presentation fields of %s only when it carries them', (kind, tab) => {
    const problems = collectProfileProblems({ tabs: [{ ...tab, number: 'two' }] });
    expect(problems).toEqual(
      PRESENTATION_KINDS.has(kind) ? ['tabs[0]: number must be a number'] : [],
    );
  });

  it('names every declared kind, in order, when the type is unrecognized', () => {
    expect(collectProfileProblems({ tabs: [{ type: 'nope' }] })).toEqual([
      `tabs[0]: type must be one of ${Object.keys(MINIMAL).join(', ')}`,
    ]);
  });
});
