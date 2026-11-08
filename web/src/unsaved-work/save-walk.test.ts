import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { nextWalkLabel, walkTitle } from './save-walk';

function tab(label: string, overrides: Partial<TabView> = {}): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 0, groupColor: '#000', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    ...overrides,
  };
}

function dirtyLookup(...labels: string[]): (label: string) => boolean {
  const dirty = new Set(labels);
  return (label) => dirty.has(label);
}

describe('nextWalkLabel', () => {
  it('follows the tab-list order', () => {
    const tabs = [tab('alpha'), tab('beta')];
    const isDirty = dirtyLookup('alpha', 'beta');
    expect(nextWalkLabel(tabs, isDirty, new Set())).toBe('alpha');
    expect(nextWalkLabel(tabs, isDirty, new Set(['alpha']))).toBe('beta');
  });

  it('returns only dirty tabs', () => {
    expect(nextWalkLabel([tab('clean'), tab('dirty')], dirtyLookup('dirty'), new Set())).toBe('dirty');
  });

  it('returns undefined when no tab is dirty or the list is empty', () => {
    expect(nextWalkLabel([tab('clean')], dirtyLookup(), new Set())).toBeUndefined();
    expect(nextWalkLabel([], dirtyLookup('alpha'), new Set())).toBeUndefined();
  });

  it('returns undefined when every dirty tab is answered', () => {
    const tabs = [tab('alpha'), tab('beta')];
    expect(nextWalkLabel(tabs, dirtyLookup('alpha', 'beta'), new Set(['alpha', 'beta']))).toBeUndefined();
  });

  it('skips an answered label in the middle of the list', () => {
    const tabs = [tab('clean'), tab('answered'), tab('next')];
    expect(nextWalkLabel(tabs, dirtyLookup('answered', 'next'), new Set(['answered']))).toBe('next');
  });

  it('skips a tab that vanished and a tab that is no longer dirty', () => {
    const before = [tab('closed'), tab('saved'), tab('next')];
    const answered = new Set<string>();
    expect(nextWalkLabel(before, dirtyLookup('closed', 'saved', 'next'), answered)).toBe('closed');
    answered.add('closed');
    expect(nextWalkLabel([tab('saved'), tab('next')], dirtyLookup('next'), answered)).toBe('next');
    expect(answered).toEqual(new Set(['closed']));
  });

  it('returns a tab that becomes dirty later even when it sits before the answered tab', () => {
    const tabs = [tab('alpha'), tab('beta')];
    expect(nextWalkLabel(tabs, dirtyLookup('alpha', 'beta'), new Set(['beta']))).toBe('alpha');
  });

  it('returns hidden, docked, and plugin tabs along with center tabs', () => {
    const tabs = [
      tab('center'),
      tab('hidden', { hidden: true }),
      tab('docked-left', { dock: 'left' }),
      tab('docked-right', { dock: 'right' }),
      tab('plugin', { view: 'plugin', plugin: { id: 'image', schemaVersion: 1, payload: {} } }),
    ];
    const isDirty = dirtyLookup('hidden', 'docked-left', 'docked-right', 'plugin');
    expect(nextWalkLabel(tabs, isDirty, new Set())).toBe('hidden');
    expect(nextWalkLabel(tabs, isDirty, new Set(['hidden']))).toBe('docked-left');
    expect(nextWalkLabel(tabs, isDirty, new Set(['hidden', 'docked-left']))).toBe('docked-right');
    expect(nextWalkLabel(tabs, isDirty, new Set(['hidden', 'docked-left', 'docked-right']))).toBe('plugin');
  });

  it('keys answered tabs by label, not title', () => {
    const tabs = [tab('editor-1', { title: 'deploy.ts' })];
    expect(nextWalkLabel(tabs, dirtyLookup('editor-1'), new Set(['deploy.ts']))).toBe('editor-1');
    expect(nextWalkLabel(tabs, dirtyLookup('editor-1'), new Set(['editor-1']))).toBeUndefined();
  });

  it('does not mutate the tabs array or the answered set', () => {
    const tabs = [tab('alpha'), tab('beta'), tab('gamma')];
    const answered = new Set(['alpha']);
    const isDirty = dirtyLookup('alpha', 'beta', 'gamma');
    const first = nextWalkLabel(tabs, isDirty, answered);
    expect(first).toBe('beta');
    expect(tabs.map((entry) => entry.label)).toEqual(['alpha', 'beta', 'gamma']);
    expect(answered).toEqual(new Set(['alpha']));
    expect(nextWalkLabel(tabs, isDirty, answered)).toBe(first);
  });

  it('starts with an empty set and advances with a populated one', () => {
    const tabs = [tab('alpha'), tab('beta'), tab('gamma')];
    const isDirty = dirtyLookup('alpha', 'beta', 'gamma');
    const answered = new Set<string>();
    expect(nextWalkLabel(tabs, isDirty, answered)).toBe('alpha');
    answered.add('alpha');
    expect(nextWalkLabel(tabs, isDirty, answered)).toBe('beta');
    answered.add('beta');
    expect(nextWalkLabel(tabs, isDirty, answered)).toBe('gamma');
  });
});

describe('walkTitle', () => {
  it('names the tab in the save prompt', () => {
    expect(walkTitle('deploy.ts')).toBe('Do you want to save changes to deploy.ts?');
  });

  it('preserves the name verbatim', () => {
    expect(walkTitle('my deploy? & <draft>')).toBe('Do you want to save changes to my deploy? & <draft>?');
    const long = 'x'.repeat(200);
    expect(walkTitle(long)).toBe(`Do you want to save changes to ${long}?`);
  });

  it('keeps an empty name empty', () => {
    expect(walkTitle('')).toBe('Do you want to save changes to ?');
  });
});
