import { describe, it, expect } from 'vitest';
import { formatTargets, resolveTargetAliases } from './targets.js';
import { makeTab } from '../tab/index.js';

describe('formatTargets', () => {
  it('renders a single tab target as its label', () => {
    expect(formatTargets([{ kind: 'tab', label: 'agent2' }])).toBe('agent2');
  });

  it('renders a single group target as group:<n>', () => {
    expect(formatTargets([{ kind: 'group', group: 3 }])).toBe('group:3');
  });

  it('joins mixed tab and group targets with a comma', () => {
    expect(formatTargets([{ kind: 'tab', label: 'agent2' }, { kind: 'group', group: 3 }])).toBe('agent2, group:3');
  });

  it('returns an empty string for no targets', () => {
    expect(formatTargets([])).toBe('');
  });
});

describe('resolveTargetAliases', () => {
  it('replaces a tab target typed as a renamed tab\'s alias with its real label', () => {
    const worker = { ...makeTab('worker', '#aaa'), title: 'reviewer' };
    expect(resolveTargetAliases([worker], [{ kind: 'tab', label: 'reviewer' }]))
      .toEqual([{ kind: 'tab', label: 'worker' }]);
  });

  it('matches case-insensitively', () => {
    const worker = { ...makeTab('worker', '#aaa'), title: 'Reviewer' };
    expect(resolveTargetAliases([worker], [{ kind: 'tab', label: 'REVIEWER' }]))
      .toEqual([{ kind: 'tab', label: 'worker' }]);
  });

  it('leaves a tab target unchanged when no tab matches its label or alias', () => {
    const worker = makeTab('worker', '#aaa');
    expect(resolveTargetAliases([worker], [{ kind: 'tab', label: 'ghost' }]))
      .toEqual([{ kind: 'tab', label: 'ghost' }]);
  });

  it('leaves group targets unchanged', () => {
    const worker = makeTab('worker', '#aaa');
    expect(resolveTargetAliases([worker], [{ kind: 'group', group: 3 }]))
      .toEqual([{ kind: 'group', group: 3 }]);
  });
});
