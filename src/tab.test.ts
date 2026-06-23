import { describe, it, expect } from 'vitest';
import { makeTab, swapTabsLeft, swapTabsRight, renumberTabs, expandTabs, flattenBuffer, wordWrap, stripComments, formatMarkdownTables, formatAgentOutput } from './tab.js';

describe('wordWrap', () => {
  it('leaves text within the width untouched', () => {
    expect(wordWrap('short line', 20)).toBe('short line');
  });

  it('wraps on word boundaries', () => {
    expect(wordWrap('the quick brown fox jumps', 10)).toBe('the quick\nbrown fox\njumps');
  });

  it('keeps every wrapped line within the width', () => {
    const wrapped = wordWrap('alpha beta gamma delta epsilon zeta eta theta', 12);
    for (const line of wrapped.split('\n')) expect(line.length).toBeLessThanOrEqual(12);
  });

  it('hard-breaks words longer than the width', () => {
    expect(wordWrap('supercalifragilistic', 5)).toBe('super\ncalif\nragil\nistic');
  });

  it('preserves existing newlines', () => {
    expect(wordWrap('one\ntwo', 10)).toBe('one\ntwo');
  });
});

describe('expandTabs', () => {
  it('leaves tab-free text untouched', () => {
    expect(expandTabs('modified: src/x.ts')).toBe('modified: src/x.ts');
  });

  it('expands a leading tab to the next 8-column stop', () => {
    expect(expandTabs('\tmodified')).toBe('        modified');
  });

  it('aligns to tab stops rather than inserting a fixed count', () => {
    expect(expandTabs('ab\tc')).toBe('ab      c'); // 2 chars + 6 spaces = column 8
  });

  it('contains no tab characters in flattened output lines', () => {
    const lines = flattenBuffer([{ input: 'git status', output: '\tmodified: a\n\tmodified: b' }]);
    for (const line of lines) {
      expect(line.text).not.toContain('\t');
    }
  });
});

describe('flattenBuffer tool-step collapsing', () => {
  const log = [
    { input: 'summarize example.com', output: 'Looking.' }, // user prompt + agent prose
    { input: 'browser goto https://example.com', output: '', acp: true },
    { input: '', output: '', acp: true }, // empty continuation turn between steps
    { input: 'browser content', output: '', acp: true },
    { input: '', output: 'The page is about widgets.' }, // final answer
  ];

  it('expands every step when collapseToolSteps is false (default)', () => {
    const lines = flattenBuffer(log);
    expect(lines.some((l) => l.type === 'collapsed')).toBe(false);
    const prompts = lines.filter((l) => l.type === 'prompt').map((l) => l.text);
    expect(prompts).toContain('browser goto https://example.com');
    expect(prompts).toContain('browser content');
  });

  it('collapses a contiguous run of acp steps into one summary line', () => {
    const lines = flattenBuffer(log, true);
    const collapsed = lines.filter((l) => l.type === 'collapsed');
    expect(collapsed).toHaveLength(1);
    // Two real commands; the empty continuation turn between them is absorbed, not counted.
    expect(collapsed[0].text).toBe('2 tool steps');
    // No raw browser command lines remain.
    expect(lines.some((l) => l.type === 'prompt' && l.text.startsWith('browser'))).toBe(false);
    // The user prompt and the final answer are still visible.
    expect(lines.some((l) => l.type === 'prompt' && l.text === 'summarize example.com')).toBe(true);
    expect(lines.some((l) => l.type === 'output' && l.text === 'The page is about widgets.')).toBe(true);
  });

  it('renders each tool step command with its response when expanded', () => {
    const lines = flattenBuffer(
      [{ input: 'browser content', output: 'Widgets\n\nWelcome to widgets.', acp: true }],
      false,
    );
    expect(lines.some((l) => l.type === 'prompt' && l.text === 'browser content')).toBe(true);
    expect(lines.some((l) => l.type === 'output' && l.text === 'Welcome to widgets.')).toBe(true);
  });

  it('counts a step with a response once when collapsed', () => {
    const lines = flattenBuffer(
      [{ input: 'browser content', output: 'Widgets\n\nWelcome to widgets.', acp: true }],
      true,
    );
    expect(lines.find((l) => l.type === 'collapsed')?.text).toBe('1 tool step');
    // The response is hidden while collapsed.
    expect(lines.some((l) => l.text === 'Welcome to widgets.')).toBe(false);
  });

  it('singularizes the count for a single step', () => {
    const lines = flattenBuffer([{ input: 'db sqlite list', output: '', acp: true }], true);
    const collapsed = lines.find((l) => l.type === 'collapsed');
    expect(collapsed?.text).toBe('1 tool step');
  });

  it('keeps separate runs separate when broken by visible prose', () => {
    const lines = flattenBuffer(
      [
        { input: 'browser goto https://a', output: '', acp: true },
        { input: '', output: 'Thinking about it.' }, // visible prose breaks the run
        { input: 'browser content', output: '', acp: true },
      ],
      true,
    );
    expect(lines.filter((l) => l.type === 'collapsed')).toHaveLength(2);
  });
});

describe('swapTabsLeft', () => {
  it('swaps tab at idx with its left neighbor', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsLeft(tabs, 1);
    expect(result[0].label).toBe('b');
    expect(result[1].label).toBe('a');
    expect(result[2].label).toBe('c');
  });

  it('renumbers tabs after swap', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsLeft(tabs, 1);
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[2].number).toBe(3);
  });

  it('returns same array for first tab (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2)];
    const result = swapTabsLeft(tabs, 0);
    expect(result).toBe(tabs);
  });

  it('returns same array for negative index (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1)];
    const result = swapTabsLeft(tabs, -1);
    expect(result).toBe(tabs);
  });
});

describe('swapTabsRight', () => {
  it('swaps tab at idx with its right neighbor', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsRight(tabs, 1);
    expect(result[0].label).toBe('a');
    expect(result[1].label).toBe('c');
    expect(result[2].label).toBe('b');
  });

  it('renumbers tabs after swap', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsRight(tabs, 1);
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[2].number).toBe(3);
  });

  it('returns same array for last tab (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2)];
    const result = swapTabsRight(tabs, 1);
    expect(result).toBe(tabs);
  });

  it('returns same array for out-of-bounds index (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1)];
    const result = swapTabsRight(tabs, 5);
    expect(result).toBe(tabs);
  });
});

describe('renumberTabs', () => {
  it('assigns sequential numbers starting at 1', () => {
    const tabs = [
      makeTab('a', '#red', 99),
      makeTab('b', '#blue', 88),
      makeTab('c', '#green', 77),
    ];
    const result = renumberTabs(tabs);
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[2].number).toBe(3);
  });

  it('preserves other tab properties', () => {
    const tabs = [makeTab('a', '#red', 1)];
    const result = renumberTabs(tabs);
    expect(result[0].label).toBe('a');
    expect(result[0].dotColor).toBe('#red');
  });
});

describe('stripComments', () => {
  it('strips a ## comment prefix', () => {
    expect(stripComments('## comment ## This is the command to run.')).toBe('This is the command to run.');
  });

  it('strips a ## comment with no trailing space before the command', () => {
    expect(stripComments('## comment ##command')).toBe('command');
  });

  it('leaves commands without ## comments untouched', () => {
    expect(stripComments('ls -la')).toBe('ls -la');
  });

  it('trims whitespace after stripping', () => {
    expect(stripComments('## note ##   clear')).toBe('clear');
  });

  it('handles empty input', () => {
    expect(stripComments('')).toBe('');
  });

  it('handles ## only (no actual comment text)', () => {
    expect(stripComments('#### command')).toBe('command');
  });

  it('strips comment from middle of command', () => {
    expect(stripComments('echo hello ##comment## world')).toBe('echo hello world');
  });

  it('strips an unterminated trailing comment', () => {
    expect(stripComments('This is the command to run ## comment')).toBe('This is the command to run');
  });

  it('strips an unterminated comment with no leading space', () => {
    expect(stripComments('clear ##note')).toBe('clear');
  });

  it('strips a whole-line unterminated comment', () => {
    expect(stripComments('## just a note')).toBe('');
  });
});

describe('formatMarkdownTables', () => {
  const md = ['| Name | Role |', '|---|---|', '| Cirie | legend |', '| Lisa | |'].join('\n');

  it('renders a markdown table as an aligned box-drawn table', () => {
    expect(formatMarkdownTables(md)).toBe(
      [
        '┌───────┬────────┐',
        '│ Name  │ Role   │',
        '├───────┼────────┤',
        '│ Cirie │ legend │',
        '│ Lisa  │        │',
        '└───────┴────────┘',
      ].join('\n'),
    );
  });

  it('leaves an empty cell as blank, keeping every row the same width', () => {
    const lines = formatMarkdownTables(md).split('\n');
    const widths = new Set(lines.map((l) => l.length));
    expect(widths.size).toBe(1);
  });

  it('preserves surrounding prose and only converts the table', () => {
    const out = formatMarkdownTables(`Here you go:\n${md}\nDone.`);
    expect(out.startsWith('Here you go:\n┌')).toBe(true);
    expect(out.endsWith('┘\nDone.')).toBe(true);
  });

  it('handles separator rows with alignment colons', () => {
    const aligned = ['| A | B |', '|:--|--:|', '| 1 | 2 |'].join('\n');
    expect(formatMarkdownTables(aligned)).toContain('│ A │ B │');
  });

  it('ignores a separator row with no preceding header', () => {
    expect(formatMarkdownTables('just --- text')).toBe('just --- text');
  });

  it('leaves text without tables untouched', () => {
    expect(formatMarkdownTables('no tables here')).toBe('no tables here');
  });
});

describe('formatAgentOutput', () => {
  it('renders tables and does not word-wrap their rows', () => {
    const md = ['| Name | Role |', '|---|---|', '| Cirie | a legend of the game |'].join('\n');
    const out = formatAgentOutput(md, 10);
    // Table rows are wider than the wrap width but must stay on a single line each.
    for (const line of out.split('\n')) expect(line).not.toMatch(/^[^┌├└│┬┼┴┐┤┘─].{0,9}$/);
    expect(out).toContain('│ Cirie │ a legend of the game │');
  });

  it('word-wraps prose around a table', () => {
    const out = formatAgentOutput('the quick brown fox jumps over', 10);
    expect(out).toBe('the quick\nbrown fox\njumps over');
  });
});
