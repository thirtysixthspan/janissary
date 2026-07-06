import { describe, it, expect } from 'vitest';
import { listMonitors, monitorConnections } from './monitor-info.js';
import type { MonitorSub } from './monitor-manager.js';
import type { Persona } from './personas.js';
import type { AcpSession } from './types.js';

const persona = (name: string): Persona => ({
  name,
  harness: { harness: 'claude', model: 'sonnet', variant: 'default' },
  body: '',
});
const session: AcpSession = { prompt: () => {}, kill: () => {} };

function makeSub(overrides: Partial<MonitorSub> = {}): MonitorSub {
  return {
    owner: 'janus',
    inline: true,
    persona: persona('bilal'),
    targets: [],
    buffer: [],
    session,
    inFlight: false,
    delivered: 0,
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

describe('monitorConnections', () => {
  it('returns an empty array when no monitors match the owner', () => {
    const sub = makeSub({ owner: 'other' });
    expect(monitorConnections([sub], 'janus')).toEqual([]);
  });

  it('returns a connection row without model info', () => {
    const sub = makeSub();
    expect(monitorConnections([sub], 'janus')).toEqual([{ text: 'monitor:bilal', kind: 'acp' }]);
  });

  it('includes provider/model info when present', () => {
    const sub = makeSub({ info: { provider: 'anthropic', model: 'sonnet' } });
    expect(monitorConnections([sub], 'janus')).toEqual([
      { text: 'monitor:bilal (anthropic/sonnet)', kind: 'acp' },
    ]);
  });

  it('falls back to just the model when provider is missing', () => {
    const sub = makeSub({ info: { model: 'sonnet' } });
    expect(monitorConnections([sub], 'janus')).toEqual([
      { text: 'monitor:bilal (sonnet)', kind: 'acp' },
    ]);
  });
});
