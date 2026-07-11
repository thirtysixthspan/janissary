import { describe, it, expect } from 'vitest';
import { formatTargets } from './monitor-targets.js';

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
