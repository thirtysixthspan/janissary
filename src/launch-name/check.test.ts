import { describe, it, expect, vi } from 'vitest';
import { agentNames } from '../agent/names.js';
import { checkLaunchName, poolCandidates, suffixCandidates, type LaunchNameRow } from './check.js';

function row(label: string, state: LaunchNameRow['state'], kind: LaunchNameRow['kind'] = 'harness'): LaunchNameRow {
  return { label, state, kind, host: 'devbox' };
}

describe('checkLaunchName — explicit names', () => {
  it('accepts a name nothing holds', () => {
    expect(checkLaunchName({ name: 'foo', explicit: true, tabs: ['janus'], rows: [] }))
      .toEqual({ accepted: true, name: 'foo', moved: false });
  });

  it('refuses a name matching an open tab, case-insensitively', () => {
    expect(checkLaunchName({ name: 'foo', explicit: true, tabs: ['janus', 'Foo'], rows: [] }))
      .toEqual({ accepted: false, message: 'Cannot launch "foo": a tab named "foo" is already open.' });
  });

  it.each(['provisioning', 'active', 'reconnecting', 'detached'] as const)('refuses a name held by a %s row', (state) => {
    expect(checkLaunchName({ name: 'foo', explicit: true, tabs: [], rows: [row('foo', state)] })).toEqual({
      accepted: false,
      message: `Cannot launch "foo": "foo" is already in the sessions tab (${state} on devbox).`,
    });
  });

  it('refuses a name held by a live agent row too', () => {
    const result = checkLaunchName({ name: 'foo', explicit: true, tabs: [], rows: [row('foo', 'detached', 'agent')] });
    expect(result.accepted).toBe(false);
  });

  it.each([
    ['a terminated row', row('foo', 'terminated')],
    ['an ssh row', row('foo', 'active', 'ssh')],
    ['a navigator row', row('foo', 'active', 'navigator')],
  ])('accepts a name matching %s', (_name, clashing) => {
    expect(checkLaunchName({ name: 'foo', explicit: true, tabs: [], rows: [clashing] }))
      .toEqual({ accepted: true, name: 'foo', moved: false });
  });

  it('refuses with the running check\'s own line', () => {
    const result = checkLaunchName({
      name: 'foo', explicit: true, tabs: [], rows: [], running: (name) => (name === 'foo' ? 'held' : undefined),
    });
    expect(result).toEqual({ accepted: false, message: 'held' });
  });
});

describe('checkLaunchName — default names', () => {
  it('keeps a free default harness name unmoved', () => {
    expect(checkLaunchName({ name: 'claude', explicit: false, tabs: [], rows: [] }))
      .toEqual({ accepted: true, name: 'claude', moved: false });
  });

  it('moves a default harness name past open tabs and live rows', () => {
    const result = checkLaunchName({ name: 'claude', explicit: false, tabs: ['claude'], rows: [row('claude-2', 'detached')] });
    expect(result).toEqual({ accepted: true, name: 'claude-3', moved: true });
  });

  it('does not move past a terminated row', () => {
    const result = checkLaunchName({ name: 'claude', explicit: false, tabs: [], rows: [row('claude', 'terminated')] });
    expect(result).toEqual({ accepted: true, name: 'claude', moved: false });
  });

  it('passes over names in `skip`', () => {
    const result = checkLaunchName({ name: 'claude', explicit: false, tabs: [], rows: [], skip: ['claude', 'claude-2'] });
    expect(result).toEqual({ accepted: true, name: 'claude-3', moved: true });
  });

  it('passes over names the running check holds', () => {
    const result = checkLaunchName({
      name: 'claude', explicit: false, tabs: [], rows: [], running: (name) => (name === 'claude' ? 'held' : undefined),
    });
    expect(result).toEqual({ accepted: true, name: 'claude-2', moved: true });
  });

  it('moves a default pool name to the next free pool name', () => {
    const result = checkLaunchName({
      name: 'ada', explicit: false, candidates: ['ada', 'bekir', 'cem'], tabs: ['ada'], rows: [row('bekir', 'detached', 'agent')],
    });
    expect(result).toEqual({ accepted: true, name: 'cem', moved: true });
  });

  it('refuses once the pool runs out', () => {
    const result = checkLaunchName({ name: 'ada', explicit: false, candidates: ['ada'], tabs: ['ada'], rows: [] });
    expect(result).toEqual({ accepted: false, message: 'All agent names are in use.' });
  });
});

describe('candidate sequences', () => {
  it('walks the uniqueLabel suffix sequence', () => {
    const sequence = suffixCandidates('claude');
    expect([sequence.next().value, sequence.next().value, sequence.next().value]).toEqual(['claude', 'claude-2', 'claude-3']);
  });

  it('draws the whole pool without losing or repeating a name', () => {
    const drawn = [...poolCandidates()];
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(drawn.toSorted(byName)).toEqual([...agentNames].toSorted(byName));
  });

  // A pool name compared against lowercased labels in its own casing is never excluded once drawn,
  // so the draw repeats it forever. The draw is capped so a regression fails here instead of hanging.
  it('draws a mixed-case pool name once and then ends', async () => {
    vi.resetModules();
    vi.doMock('../agent/names.js', () => ({ agentNames: ['Alice', 'bob'] }));
    try {
      const { poolCandidates: draw } = await import('./check.js');
      const drawn: string[] = [];
      for (const name of draw()) {
        drawn.push(name);
        if (drawn.length > 5) break;
      }
      expect(drawn.toSorted((a, b) => a.localeCompare(b))).toEqual(['Alice', 'bob']);
    } finally {
      vi.doUnmock('../agent/names.js');
      vi.resetModules();
    }
  });
});
