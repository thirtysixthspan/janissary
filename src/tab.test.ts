import { describe, it, expect } from 'vitest';
import { makeTab, swapTabsLeft, swapTabsRight, renumberTabs, expandTabs, flattenBuffer, wordWrap, stripComments } from './tab.js';

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
