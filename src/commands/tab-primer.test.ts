import { describe, expect, it } from 'vitest';
import { TAB_PRIMER, isTabCommandLine } from './tab-primer.js';
import { TAB_SUBCOMMANDS } from './parse-tab.js';

describe('tab primer', () => {
  it('tells the agent the one-line form and every subcommand', () => {
    expect(TAB_PRIMER).toContain('tab <subcommand> <tab> [argument]');
    for (const subcommand of TAB_SUBCOMMANDS) expect(TAB_PRIMER).toContain(subcommand);
    expect(TAB_PRIMER.split('\n').slice(-3)).toEqual(['```janissary', 'tab focus Editor', '```']);
  });

  it.each([
    'tab',
    'tab focus notes',
    'TAB FOCUS notes',
    '  tab dock "review notes" left',
  ])('recognizes %s as a tab command line', (line) => {
    expect(isTabCommandLine(line)).toBe(true);
  });

  it.each(['tabs', 'tabs focus notes', 'notify tab focus notes', '/tab focus notes', 'xtab focus notes'])(
    'rejects %s as a tab command line',
    (line) => { expect(isTabCommandLine(line)).toBe(false); },
  );
});
