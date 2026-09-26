import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type RemoteSessionView,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';
import type { SessionRow } from './shared.js';

const LIVE: RemoteSessionView = {
  id: 'claude', host: 'devbox', name: 'claude', kind: 'harness', state: 'active',
  activity: 1000, destination: 'devbox', workspace: '/srv/ws', joined: false,
  actions: ['focus', 'detach'], label: 'claude', session: 'session-1',
};

const PARKED: RemoteSessionView = {
  id: 'session-2:rpty1', host: 'devbox', name: 'claude-2', kind: 'harness', state: 'detached',
  activity: 500, destination: 'devbox', workspace: '/srv/ws2', joined: false,
  actions: ['attach', 'terminate'], label: 'claude-2', session: 'session-2',
};

const ROWS: RemoteSessionView[] = [LIVE, PARKED];

function fakeCapabilities(rows: RemoteSessionView[] = ROWS) {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const docks: { key: string; dock: 'left' | 'right' | null }[] = [];
  const actions: TabPluginTopicAction[] = [];
  const capabilities = {
    note: vi.fn(),
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      opened.push({ key, value: factory() });
    },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => {
      updated.push({ key, value: factory() });
    },
    dockTab: (key: string, dock: 'left' | 'right' | null) => { docks.push({ key, dock }); },
    openClaimedFiles: vi.fn(),
    topicData: () => rows,
    topicAction: (action: TabPluginTopicAction) => { actions.push(action); },
    configuredViewer: () => '',
    openExternally: () => false,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, docks, opened, updated };
}

function payloadOf(rows: RemoteSessionView[] = ROWS): { entries: SessionRow[] } {
  const fixture = fakeCapabilities(rows);
  activate().command?.('', fixture.capabilities);
  return fixture.opened[0].value.payload as { entries: SessionRow[] };
}

describe('sessions plugin command', () => {
  it("opens the singleton list titled 'sessions' with the rows the topic carries", () => {
    const fixture = fakeCapabilities();

    activate().command?.('', fixture.capabilities);

    expect(fixture.opened).toHaveLength(1);
    expect(fixture.opened[0].key).toBe('sessions');
    expect(fixture.opened[0].value.title).toBe('sessions');
    expect(payloadOf().entries.map((row) => row.id)).toEqual(['claude', 'session-2:rpty1']);
  });

  it('docks into the named sidebar, and undocks back to centre when bare', () => {
    const left = fakeCapabilities();
    activate().command?.('left', left.capabilities);
    expect(left.docks).toEqual([{ key: 'sessions', dock: 'left' }]);

    const right = fakeCapabilities();
    activate().command?.(' RIGHT ', right.capabilities);
    expect(right.docks).toEqual([{ key: 'sessions', dock: 'right' }]);

    const bare = fakeCapabilities();
    activate().command?.('', bare.capabilities);
    expect(bare.docks).toEqual([{ key: 'sessions', dock: null }]);
  });

  it('rejects an unrecognized argument with usage instead of disabling the plugin', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().command?.('sideways', fixture.capabilities))
      .toThrow(new TabPluginRejection('Usage: sessions [left|right]'));
    expect(fixture.opened).toEqual([]);
  });

  it('opens an empty list when nothing is running or parked', () => {
    expect(payloadOf([]).entries).toEqual([]);
  });
});

describe('sessions plugin notifications', () => {
  it('redraws the list from the topic slice without renaming the tab', () => {
    const fixture = fakeCapabilities();
    activate().notify?.({ topic: 'sessions', data: ROWS, tabs: ['sessions'] }, fixture.capabilities);

    expect(fixture.updated).toHaveLength(1);
    expect(fixture.updated[0].key).toBe('sessions');
    expect(fixture.updated[0].value.title).toBeUndefined();
  });

  it('ignores a topic it did not declare', () => {
    const fixture = fakeCapabilities();
    activate().notify?.({ topic: 'schedules', data: [], tabs: ['sessions'] }, fixture.capabilities);
    expect(fixture.updated).toEqual([]);
  });
});

describe('sessions plugin intents', () => {
  function run(intent: string, payload: unknown, rows: RemoteSessionView[] = ROWS) {
    const fixture = fakeCapabilities(rows);
    const result = activate().intent(
      { tab: 'sessions', intent, payload, tabPayload: payloadOf(rows) },
      fixture.capabilities,
    );
    return { ...fixture, result };
  }

  it.each([
    { intent: 'detach', id: 'claude', expected: { topic: 'sessions', action: 'detach', label: 'claude' } },
    { intent: 'focus', id: 'claude', expected: { topic: 'sessions', action: 'focus', label: 'claude' } },
  ])('routes $intent to a tab-addressed topic action', ({ intent, id, expected }) => {
    expect(run(intent, { id }).actions).toEqual([expected]);
  });

  it.each([
    { intent: 'attach', expected: { topic: 'sessions', action: 'attach', session: 'session-2' } },
    { intent: 'terminate', expected: { topic: 'sessions', action: 'terminate', session: 'session-2' } },
  ])('routes $intent to a session-addressed topic action', ({ intent, expected }) => {
    expect(run(intent, { id: 'session-2:rpty1' }).actions).toEqual([expected]);
  });

  it('routes refresh without naming a row', () => {
    expect(run('refresh', {}).actions).toEqual([{ topic: 'sessions', action: 'refresh' }]);
  });

  it('answers an intent with null rather than falling off its last line', () => {
    expect(run('focus', { id: 'claude' }).result).toBeNull();
  });

  // The row itself says what it offers, so a client cannot detach a parked session or attach a
  // live one even before the host's own narrowing runs.
  it('rejects a verb the named row does not offer', () => {
    expect(() => run('detach', { id: 'session-2:rpty1' }))
      .toThrow(new TabPluginRejection('detach is not offered on that row'));
    expect(() => run('attach', { id: 'claude' }))
      .toThrow(new TabPluginRejection('attach is not offered on that row'));
  });

  it('rejects a row id the list is not showing', () => {
    expect(() => run('focus', { id: 'ghost' }))
      .toThrow(new TabPluginRejection('no session row "ghost"'));
  });

  it('rejects an unknown intent name', () => {
    expect(() => run('explode', { id: 'claude' }))
      .toThrow(new TabPluginRejection('unknown sessions intent "explode"'));
  });

  it('rejects an inherited object property name as an unknown intent, not a crash', () => {
    expect(() => run('toString', { id: 'claude' }))
      .toThrow(new TabPluginRejection('unknown sessions intent "toString"'));
  });

  it.each([null, [], {}, { id: '' }, { id: 7 }])('rejects a malformed row payload: %s', (payload) => {
    expect(() => run('focus', payload)).toThrow(TabPluginRejection);
  });

  it.each(['detach', 'focus', 'close', 'attach', 'terminate', 'forget'])(
    'names the verb when rejecting a malformed %s payload',
    (intent) => {
      expect(() => run(intent, {})).toThrow(new TabPluginRejection(`invalid ${intent} payload`));
    },
  );

  it('rejects a refresh carrying a payload it should not have', () => {
    expect(() => run('refresh', { id: 'claude' }))
      .toThrow(new TabPluginRejection('invalid refresh payload'));
  });

  // The tab payload is the host's own record, not client input, so a bad one is this plugin
  // producing something invalid — a failure rather than a request worth answering.
  it('reports a malformed tab payload as a failure, not a rejection', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().intent(
      { tab: 'sessions', intent: 'focus', payload: { id: 'claude' }, tabPayload: { entries: 'no' } },
      fixture.capabilities,
    )).toThrow('invalid sessions tab payload');
  });
});

describe('sessions plugin opener', () => {
  it('rejects both presentations, since it claims no file extensions', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().opener.inline('/tmp/x', fixture.capabilities))
      .toThrow(new TabPluginRejection('sessions opens no files'));
    expect(() => activate().opener.external('/tmp/x', fixture.capabilities))
      .toThrow(new TabPluginRejection('sessions opens no files'));
  });
});
