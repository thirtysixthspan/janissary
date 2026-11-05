import { describe, expect, it, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import type { ConnectionKind, LiveConnectionRow, RecordConnectionRow } from './shared.js';
import { ConnectionTabs } from './tabs.js';
import { openConnectionLookup } from './lookup.js';

type RecordOptions = {
  id: string;
  title: string;
  ownerLabel?: string;
  status?: RecordConnectionRow['status'];
  model?: string;
  updatedAt?: number;
};

function liveRow(id: string, kind: ConnectionKind, ownerLabel = 'first'): LiveConnectionRow {
  return {
    type: 'live', id, kind, display: `${kind}:${id}`, host: 'Local', ownerLabel, ownerName: 'global',
    status: 'Open', orderingTimestamp: 1,
  };
}

function recordRow({
  id, title, ownerLabel = 'elsewhere', status = 'Closed', model = 'model-a', updatedAt = 100,
}: RecordOptions): RecordConnectionRow {
  return {
    type: 'record', id, kind: 'acp', title, model, host: 'Local', ownerLabel, ownerName: 'Owner',
    startedAt: 1, updatedAt, status, orderingTimestamp: updatedAt,
  };
}

function fixture(rows: (RecordConnectionRow | LiveConnectionRow)[] = [], originLabel: string | null = 'owner') {
  const topicAction = vi.fn();
  const opened: { id: string; value: unknown }[] = [];
  const openOrFocusTab = vi.fn((id: string, factory: () => unknown) => {
    opened.push({ id, value: factory() });
  });
  const topicData = vi.fn(() => ({ rows }));
  const capabilities = {
    topicAction, openOrFocusTab, topicData,
    originTab: vi.fn(() => (originLabel === null ? undefined : { label: originLabel, cwd: '/repo', root: '/repo' })),
    rejectRequest: vi.fn((reason: string): never => { throw new Error(reason); }),
    reportFailure: vi.fn((reason: string): never => { throw new Error(reason); }),
  } as unknown as TabPluginServerCapabilities;
  return { tabs: new ConnectionTabs(), capabilities, topicAction, openOrFocusTab, opened };
}

describe('openConnectionLookup', () => {
  it('opens the newest case-insensitive whole-title match even out of order and when closed elsewhere', () => {
    const older = recordRow({ id: 'older', title: 'ACP: EXPLAIN THIS TEST', updatedAt: 100 });
    const newer = recordRow({ id: 'newer', title: 'ACP: explain this test', updatedAt: 300 });
    const f = fixture([older, newer]);

    expect(openConnectionLookup('acp: Explain This Test', f.tabs, f.capabilities)).toBe(true);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'newer' });
    expect(f.opened).toEqual([expect.objectContaining({
      id: 'newer', value: expect.objectContaining({ title: 'ACP: explain this test' }),
    })]);
  });

  it('matches generated agent titles without narrowing title lookup to open core ACP rows', () => {
    const agent = { ...recordRow({ id: 'agent-run', title: 'Agent: task.md', updatedAt: 100 }), kind: 'agent' as const };
    const f = fixture([agent]);

    expect(openConnectionLookup('AGENT: TASK.MD', f.tabs, f.capabilities)).toBe(true);
    expect(f.opened[0]).toMatchObject({ id: 'agent-run' });
  });

  it('prefers an exact UUID over a record whose full title is that same text', () => {
    const titleCollision = recordRow({ id: 'other', title: 'uuid-target', updatedAt: 300 });
    const exact = recordRow({ id: 'uuid-target', title: 'ACP: direct', updatedAt: 100 });
    const f = fixture([titleCollision, exact]);

    expect(openConnectionLookup('uuid-target', f.tabs, f.capabilities)).toBe(true);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'uuid-target' });
    expect(f.opened[0]).toMatchObject({ id: 'uuid-target' });
  });

  it('prefers a live kind/id target over a record titled with the same text', () => {
    const titleCollision = recordRow({ id: 'record', title: 'sqlite:shared' });
    const live = liveRow('shared', 'sqlite', 'first');
    const f = fixture([titleCollision, live]);

    expect(openConnectionLookup('sqlite:shared', f.tabs, f.capabilities)).toBe(true);
    expect(f.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared', ownerLabel: 'first',
    });
    expect(f.openOrFocusTab).not.toHaveBeenCalled();
  });

  it('prefers the invoking tab own live row when two tabs expose the same kind and id', () => {
    const first = liveRow('zsh', 'shell', 'first');
    const second = liveRow('zsh', 'shell', 'second');

    const mine = fixture([first, second], 'second');
    expect(openConnectionLookup('shell:zsh', mine.tabs, mine.capabilities)).toBe(true);
    expect(mine.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'second',
    });

    const unrelated = fixture([first, second], 'third');
    expect(openConnectionLookup('shell:zsh', unrelated.tabs, unrelated.capabilities)).toBe(true);
    expect(unrelated.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'first',
    });

    const absent = fixture([first, second], null);
    expect(openConnectionLookup('shell:zsh', absent.tabs, absent.capabilities)).toBe(true);
    expect(absent.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'first',
    });
  });

  it('resolves the invoking tab ACP reference before a newer same-model record owned elsewhere', () => {
    const other = recordRow({ id: 'other-owner', title: 'ACP: other', ownerLabel: 'other', status: 'Idle', updatedAt: 300 });
    const mine = recordRow({ id: 'mine', title: 'ACP: mine', ownerLabel: 'owner', status: 'Idle', updatedAt: 100 });
    const f = fixture([other, mine], 'owner');

    expect(openConnectionLookup('acp:model-a', f.tabs, f.capabilities)).toBe(true);
    expect(f.opened[0]).toMatchObject({ id: 'mine' });
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'mine' });
  });

  it('falls back to a colon-bearing title when no target interpretation matches', () => {
    const row = recordRow({ id: 'colon-title', title: 'ACP: odd:name', updatedAt: 50 });
    const f = fixture([row]);

    expect(openConnectionLookup('ACP: odd:name', f.tabs, f.capabilities)).toBe(true);
    expect(f.opened[0]).toMatchObject({ id: 'colon-title' });
  });

  it('requires the complete stored title without normalizing whitespace or accepting a prefix', () => {
    const title = 'ACP: explain  this test';
    for (const query of ['ACP: explain this test', 'explain  this test', 'ACP: explain']) {
      const f = fixture([recordRow({ id: 'spaced', title })]);
      expect(openConnectionLookup(query, f.tabs, f.capabilities)).toBe(false);
      expect(f.topicAction).not.toHaveBeenCalled();
      expect(f.openOrFocusTab).not.toHaveBeenCalled();
    }

    const exact = fixture([recordRow({ id: 'spaced', title })]);
    expect(openConnectionLookup(title, exact.tabs, exact.capabilities)).toBe(true);
    expect(exact.opened[0]).toMatchObject({ id: 'spaced' });
  });

  it('keeps the supplied row order for equal activity timestamps', () => {
    const first = recordRow({ id: 'first-row', title: 'ACP: tie', updatedAt: 100 });
    const second = recordRow({ id: 'second-row', title: 'ACP: tie', updatedAt: 100 });
    const f = fixture([first, second]);

    expect(openConnectionLookup('ACP: tie', f.tabs, f.capabilities)).toBe(true);
    expect(f.opened[0]).toMatchObject({ id: 'first-row' });
  });

  it('forwards the live row owner label and returns false on a whole-text miss', () => {
    const f = fixture([liveRow('shared', 'sqlite', '')]);

    expect(openConnectionLookup('sqlite:shared', f.tabs, f.capabilities)).toBe(true);
    expect(f.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared', ownerLabel: '',
    });
    expect(openConnectionLookup('no such title', f.tabs, f.capabilities)).toBe(false);
    expect(f.opened).toEqual([]);
  });
});
