import { describe, it, expect } from 'vitest';
import { listMonitors, monitorConnections, monitorNames } from './info.js';
import type { MonitorSub } from './live-monitors.js';
import type { Persona } from '../personas.js';

const persona = (name: string): Persona => ({
  name,
  role: 'ask',
  body: '',
});

function makeSub(overrides: Partial<MonitorSub> = {}): MonitorSub {
  return {
    owner: 'janus',
    name: 'bilal',
    inline: true,
    persona: persona('bilal'),
    targets: [],
    buffer: [],
    harnessTranscriptSeen: new Map(),
    harnessSeen: new Map(),
    editorSeen: new Map(),
    pageSeen: new Map(),
    delimiter: 'test-delimiter',
    firstPrompt: 'Watch closely',
    inFlight: false,
    resetGeneration: 0,
    delivered: 0,
    contextBytes: 0,
    contextText: [],
    timer: setInterval(() => {}, 1_000_000),
    subs: [],
    ...overrides,
  };
}

describe('listMonitors', () => {
  it('returns an empty array for no monitors', () => {
    expect(listMonitors([])).toEqual([]);
  });

  it('formats an inline monitor with tab targets', () => {
    const sub = makeSub({ targets: [{ kind: 'tab', label: 'janus' }] });
    expect(listMonitors([sub])).toEqual(['bilal: janus ← janus (inline, 0 suggestions)']);
  });

  it('formats an external monitor with group targets', () => {
    const sub = makeSub({ inline: false, targets: [{ kind: 'group', group: 2 }], delivered: 1 });
    expect(listMonitors([sub])).toEqual(['bilal: group:2 ← janus (external, 1 suggestion)']);
  });

  it('joins multiple targets and pluralizes suggestion count', () => {
    const sub = makeSub({
      targets: [{ kind: 'tab', label: 'wali' }, { kind: 'group', group: 3 }],
      delivered: 4,
    });
    expect(listMonitors([sub])).toEqual(['bilal: wali, group:3 ← janus (inline, 4 suggestions)']);
  });
});

describe('monitorNames', () => {
  it('returns only the runtime names of one owner\'s monitors', () => {
    const mine = makeSub({ name: 'security' });
    const theirs = makeSub({ name: 'other', owner: 'elsewhere' });
    expect(monitorNames([mine, theirs], 'janus')).toEqual(['security']);
  });
});

describe('monitorConnections', () => {
  it('returns an empty array when no monitors match the owner', () => {
    const sub = makeSub({ owner: 'other' });
    expect(monitorConnections([sub], 'janus')).toEqual([]);
  });

  it('carries the monitor scope and name on acpRef', () => {
    const sub = makeSub({ name: 'security' });
    const [row] = monitorConnections([sub], 'janus');
    expect(row.acpRef).toEqual({ scope: 'monitor', name: 'security' });
  });

  it('is a name-only row with no provider/model suffix', () => {
    const sub = makeSub();
    expect(monitorConnections([sub], 'janus')).toEqual([
      { text: 'monitor:bilal', kind: 'acp', acpRef: { scope: 'monitor', name: 'bilal' } },
    ]);
  });
});
