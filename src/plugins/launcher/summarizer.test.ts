import { describe, expect, it } from 'vitest';
import type { TabActivityEntry } from '../api.js';
import {
  buildSummarizerPrompt,
  describeTab,
  parseTabSummaries,
  REPLY_FORMAT,
} from './summarizer.js';

function tab(overrides: Partial<TabActivityEntry> = {}): TabActivityEntry {
  return {
    label: 'shell',
    busy: false,
    hasUnread: false,
    needsInput: false,
    lastActivity: Date.now(),
    cwd: '/repo',
    logLength: 3,
    ...overrides,
  };
}

describe('parsing a summarizer reply', () => {
  it('takes one paragraph per marker line, keyed by the tab label', () => {
    const parsed = parseTabSummaries([
      '[[tab:shell]] Running the test suite; four suites left.',
      '[[tab:build]] Waiting on a permission prompt for the deploy step.',
    ].join('\n\n'));

    expect(parsed.get('shell')).toBe('Running the test suite; four suites left.');
    expect(parsed.get('build')).toBe('Waiting on a permission prompt for the deploy step.');
  });

  // A paragraph that carries another tab's name inside it must not be split: the marker is a line of its
  // own, not a word.
  it('keeps a paragraph that mentions another tab', () => {
    const parsed = parseTabSummaries('[[tab:shell]] Working next to the build tab.');

    expect(parsed.get('shell')).toBe('Working next to the build tab.');
    expect(parsed.has('build')).toBe(false);
  });

  it('takes a paragraph that spans several lines, up to the next marker', () => {
    const parsed = parseTabSummaries([
      '[[tab:agent]] First line of the recap.',
      'Second line, still the same tab.',
      '[[tab:build]] The other tab.',
    ].join('\n'));

    expect(parsed.get('agent')).toBe('First line of the recap.\nSecond line, still the same tab.');
    expect(parsed.get('build')).toBe('The other tab.');
  });

  it('drops a marker with no label, or with nothing after it', () => {
    const parsed = parseTabSummaries(['[[]]] Nothing to say.', '[[tab:shell]]', '[[tab:  ]] Blank too.'].join('\n'));

    expect(parsed.size).toBe(0);
  });

  it('returns nothing for a reply that matches nothing at all', () => {
    expect(parseTabSummaries('OK').size).toBe(0);
    expect(parseTabSummaries('').size).toBe(0);
  });

  it('caps a paragraph, so a row never has to render a wall of prose', () => {
    const parsed = parseTabSummaries(`[[tab:shell]] ${'x'.repeat(900)}`);

    expect(parsed.get('shell')).toHaveLength(400);
  });
});

describe('describing one tab to the summarizer', () => {
  it('carries the tab label, its flags, and its last command', () => {
    const text = describeTab(tab({
      label: 'build', title: 'Release build', busy: true, hasUnread: true, lastCommand: './build.sh',
      tail: 'assembling release artifacts',
    }));

    expect(text).toContain('[[tab:build]]');
    expect(text).toContain('named Release build');
    expect(text).toContain('busy running work right now');
    expect(text).toContain('has unseen output');
    expect(text).toContain('Last command: ./build.sh');
    expect(text).toContain('assembling release artifacts');
  });

  it('reports the state each flag is actually in, rather than a fixed list', () => {
    const idle = describeTab(tab({ busy: false, hasUnread: false }));

    expect(idle).toContain('idle');
    expect(idle).toContain('has no unseen output');
    expect(idle).toContain('No command yet.');
    expect(idle).toContain('No transcript content yet.');
  });

  it('says a tab is waiting on the user when it is', () => {
    expect(describeTab(tab({ needsInput: true }))).toContain('waiting on the user to answer a prompt');
    expect(describeTab(tab({ needsInput: false }))).toContain('not waiting on the user');
  });

  it('names the view a tab renders, and says a plain tab is a terminal one', () => {
    expect(describeTab(tab({ view: 'editor' }))).toContain('a editor tab');
    expect(describeTab(tab())).toContain('a terminal tab');
  });
});

describe('building one flush prompt', () => {
  it('asks for every tab it was given, in order', () => {
    const prompt = buildSummarizerPrompt([tab({ label: 'one' }), tab({ label: 'two' })]);

    expect(prompt.indexOf('[[tab:one]]')).toBeLessThan(prompt.indexOf('[[tab:two]]'));
    expect(prompt).toContain('These are the tabs currently open');
  });

  it('asks for nothing at all about an empty list', () => {
    expect(buildSummarizerPrompt([])).toBe(
      'These are the tabs currently open in the application, and where each one stands.',
    );
  });
});

describe('the reply format the persona is primed with', () => {
  it('names the marker shape the parser reads, and asks for nothing else', () => {
    expect(REPLY_FORMAT).toContain('[[tab:<label>]]');
    expect(REPLY_FORMAT).toContain('No preamble');
    expect(REPLY_FORMAT).toContain('at most 400 characters');
  });
});
