import { describe, it, expect } from 'vitest';
import { makeTab, dotColors, distinctColor, canMoveTab, insertTabInGroup, swapTabsLeft, swapTabsRight, renumberTabs, expandTabs, flattenBuffer, wordWrap, stripComments } from './index.js';

describe('group', () => {
  it('defaults a tab to group 1', () => {
    expect(makeTab('a', '#red', 1).group).toBe(1);
  });

  it('records the supplied group number', () => {
    expect(makeTab('a', '#red', 1, [], [], undefined, 3).group).toBe(3);
  });

  it('keeps a tab group when renumbering position', () => {
    const tabs = [makeTab('a', '#red', 1, [], [], undefined, 2), makeTab('b', '#blue', 2, [], [], undefined, 2)];
    expect(renumberTabs(tabs).map((t) => t.group)).toEqual([2, 2]);
  });

  it('defaults the group color to the tab dot color', () => {
    expect(makeTab('a', '#red', 1).groupColor).toBe('#red');
  });

  it('stores an explicit group color independent of the dot color', () => {
    expect(makeTab('a', '#red', 1, [], [], undefined, 2, '#abc123').groupColor).toBe('#abc123');
  });
});

describe('distinctColor', () => {
  it('keeps a preferred color that is far from those in use', () => {
    expect(distinctColor(['#000000'], dotColors[2])).toBe(dotColors[2]);
  });

  it('replaces a preferred color that matches one already in use', () => {
    expect(distinctColor([dotColors[0]], dotColors[0])).not.toBe(dotColors[0]);
  });

  it('picks a palette color substantially different from every color in use', () => {
    const used = [dotColors[0], dotColors[1]];
    const picked = distinctColor(used);
    expect(used).not.toContain(picked);
    // The pick is clearly distinct from each used color.
    const distribution = (a: string, b: string) => {
      const p = (h: string) => { const n = Number.parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
      const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
      return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
    };
    expect(Math.min(...used.map((u) => distribution(picked, u)))).toBeGreaterThan(60);
  });
});

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

describe('flattenBuffer running indicator', () => {
  it('does not emit a Running... line for an in-flight command', () => {
    const lines = flattenBuffer([{ input: 'sleep 5', output: '', running: true }]);
    expect(lines.some((l) => l.type === 'prompt' && l.text === 'sleep 5' && l.running)).toBe(true);
    expect(lines.some((l) => l.type === 'output' && l.text === 'Running...')).toBe(false);
  });

  it('shows streamed output', () => {
    const lines = flattenBuffer([{ input: 'echo hi', output: 'hi', running: true }]);
    expect(lines.some((l) => l.text === 'Running...')).toBe(false);
    expect(lines.some((l) => l.type === 'output' && l.text === 'hi')).toBe(true);
  });

  it('does not mark a completed command as running', () => {
    const lines = flattenBuffer([{ input: 'echo hi', output: 'hi', running: false }]);
    expect(lines.some((l) => l.running)).toBe(false);
  });
});

describe('flattenBuffer markdown (ACP reply)', () => {
  it('keeps a markdown entry as one block instead of splitting into output lines', () => {
    const md = '# Title\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    const lines = flattenBuffer([{ input: 'acp hi', output: md, markdown: true }]);
    const mdLines = lines.filter((l) => l.type === 'markdown');
    expect(mdLines).toHaveLength(1);
    expect(mdLines[0].text).toBe(md); // raw markdown preserved verbatim
    // The prose is not split into per-line plain `output` entries.
    expect(lines.some((l) => l.type === 'output')).toBe(false);
    // The user's prompt line still renders above it.
    expect(lines.some((l) => l.type === 'prompt' && l.text === 'acp hi')).toBe(true);
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

describe('group moves', () => {
  // g1=[a], g2=[b, c]
  const grouped = () => [
    makeTab('a', '#red', 1, [], [], undefined, 1),
    makeTab('b', '#blue', 2, [], [], undefined, 2),
    makeTab('c', '#green', 3, [], [], undefined, 2),
  ];

  it('allows a swap within the same group', () => {
    expect(canMoveTab(grouped(), 2, -1)).toBe(true); // c <-> b (both g2)
    expect(swapTabsRight(grouped(), 1).map((t) => t.label)).toEqual(['a', 'c', 'b']);
  });

  it('blocks a swap across a group boundary (no-op)', () => {
    const tabs = grouped();
    expect(canMoveTab(tabs, 1, -1)).toBe(false); // b (g2) cannot move into a (g1)
    expect(swapTabsLeft(tabs, 1)).toBe(tabs);
    expect(canMoveTab(tabs, 0, 1)).toBe(false); // a (g1) cannot move into b (g2)
    expect(swapTabsRight(tabs, 0)).toBe(tabs);
  });

  it('keeps groups assigned when reordering within a group', () => {
    expect(swapTabsRight(grouped(), 1).map((t) => t.group)).toEqual([1, 2, 2]);
  });
});

describe('insertTabInGroup', () => {
  it('inserts a new tab next to its group so the group stays connected', () => {
    // g1=[a], g2=[b]; a new g1 tab must land beside a, not at the end.
    const tabs = [
      makeTab('a', '#red', 1, [], [], undefined, 1),
      makeTab('b', '#blue', 2, [], [], undefined, 2),
    ];
    const result = insertTabInGroup(tabs, makeTab('a2', '#pink', 0, [], [], undefined, 1));
    expect(result.map((t) => t.label)).toEqual(['a', 'a2', 'b']);
    expect(result.map((t) => t.number)).toEqual([1, 2, 3]);
  });

  it('appends a brand-new group at the end', () => {
    const tabs = [makeTab('a', '#red', 1, [], [], undefined, 1)];
    const result = insertTabInGroup(tabs, makeTab('b', '#blue', 0, [], [], undefined, 2));
    expect(result.map((t) => t.label)).toEqual(['a', 'b']);
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

