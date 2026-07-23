import { describe, it, expect } from 'vitest';
import { listMonitors, monitorConnections, formatConnection, personaSummary } from './info.js';
import type { MonitorSub } from './manager.js';
import type { Persona } from '../personas.js';
import type { AcpSession } from '../types.js';

const persona = (name: string): Persona => ({
  name,
  harness: { harness: 'claude', model: 'sonnet', variant: 'default' },
  body: '',
  tools: [],
});
const session: AcpSession = { prompt: () => {}, kill: () => {} };

function makeSub(overrides: Partial<MonitorSub> = {}): MonitorSub {
  return {
    owner: 'janus',
    name: 'bilal',
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

  it('carries the monitor scope and name on acpRef', () => {
    const sub = makeSub({ name: 'security' });
    const [row] = monitorConnections([sub], 'janus');
    expect(row.acpRef).toEqual({ scope: 'monitor', name: 'security' });
  });

  it('returns a connection row without model info', () => {
    const sub = makeSub();
    expect(monitorConnections([sub], 'janus')).toEqual([
      { text: 'monitor:bilal', kind: 'acp', acpRef: { scope: 'monitor', name: 'bilal' } },
    ]);
  });

  it('includes provider/model info when present', () => {
    const sub = makeSub({ info: { provider: 'anthropic', model: 'sonnet' } });
    expect(monitorConnections([sub], 'janus')).toEqual([
      { text: 'monitor:bilal (anthropic/sonnet)', kind: 'acp', acpRef: { scope: 'monitor', name: 'bilal' } },
    ]);
  });

  it('falls back to just the model when provider is missing', () => {
    const sub = makeSub({ info: { model: 'sonnet' } });
    expect(monitorConnections([sub], 'janus')).toEqual([
      { text: 'monitor:bilal (sonnet)', kind: 'acp', acpRef: { scope: 'monitor', name: 'bilal' } },
    ]);
  });
});

describe('formatConnection', () => {
  it('joins provider and model with a slash', () => {
    expect(formatConnection({ provider: 'anthropic', model: 'sonnet' })).toBe('anthropic/sonnet');
  });

  it('omits the slash when only the model is present', () => {
    expect(formatConnection({ model: 'sonnet' })).toBe('sonnet');
  });

  it('returns an empty string when both are absent', () => {
    expect(formatConnection({})).toBe('');
  });
});

describe('personaSummary', () => {
  it('returns the first sentence including its period', () => {
    const p = persona('bilal');
    p.body = 'You are a security monitor. You watch for problems.';
    expect(personaSummary(p)).toBe('You are a security monitor.');
  });

  it('falls back to the trimmed full body when there is no period', () => {
    const p = persona('bilal');
    p.body = 'Watch closely';
    expect(personaSummary(p)).toBe('Watch closely');
  });
});
