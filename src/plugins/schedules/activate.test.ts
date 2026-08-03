import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type AggregatedScheduleView,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';

const ROWS: AggregatedScheduleView[] = [
  { tab: 'agent-1', id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: true, command: 'echo hi' },
];

function fakeCapabilities(rows: AggregatedScheduleView[] = ROWS) {
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

const TAB_PAYLOAD = { entries: [] };

describe('schedules plugin command', () => {
  it('opens the singleton list with the topic rows it currently carries', () => {
    const fixture = fakeCapabilities();

    activate().command?.('', fixture.capabilities);

    expect(fixture.opened).toEqual([{
      key: 'schedules',
      value: { title: 'schedules', payload: { entries: ROWS } },
    }]);
  });

  it('docks into the named sidebar, and undocks back to centre when bare', () => {
    const left = fakeCapabilities();
    activate().command?.('left', left.capabilities);
    expect(left.docks).toEqual([{ key: 'schedules', dock: 'left' }]);

    const right = fakeCapabilities();
    activate().command?.(' RIGHT ', right.capabilities);
    expect(right.docks).toEqual([{ key: 'schedules', dock: 'right' }]);

    const bare = fakeCapabilities();
    activate().command?.('', bare.capabilities);
    expect(bare.docks).toEqual([{ key: 'schedules', dock: null }]);
  });

  it('rejects an unrecognized argument with usage instead of disabling the plugin', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().command?.('sideways', fixture.capabilities))
      .toThrow(new TabPluginRejection('Usage: schedules [left|right]'));
    expect(fixture.opened).toEqual([]);
  });
});

describe('schedules plugin notifications', () => {
  it('replaces the tab rows, leaving the tab strip name alone', () => {
    const fixture = fakeCapabilities();

    activate().notify?.({ topic: 'schedules', data: ROWS, tabs: ['schedules'] }, fixture.capabilities);

    expect(fixture.updated).toEqual([{ key: 'schedules', value: { payload: { entries: ROWS } } }]);
    expect(fixture.updated[0].value.title).toBeUndefined();
  });
});

describe('schedules plugin intents', () => {
  const intent = (name: string, payload: unknown, fixture: ReturnType<typeof fakeCapabilities>) =>
    activate().intent(
      { tab: 'schedules', intent: name, payload, tabPayload: TAB_PAYLOAD }, fixture.capabilities,
    );

  it('turns each intent into the topic action it names', () => {
    const fixture = fakeCapabilities();

    expect(intent('clear', {}, fixture)).toBeNull();
    expect(intent('cancel', { tab: 'agent-1', id: 'fetch' }, fixture)).toBeNull();
    expect(intent('focus-owner', { tab: 'agent-1' }, fixture)).toBeNull();

    expect(fixture.actions).toEqual([
      { topic: 'schedules', action: 'clear' },
      { topic: 'schedules', action: 'cancel', tab: 'agent-1', id: 'fetch' },
      { topic: 'schedules', action: 'focusOwner', tab: 'agent-1' },
    ]);
  });

  it('answers malformed and unknown intents with a rejection, not a plugin failure', () => {
    const fixture = fakeCapabilities();
    for (const [name, payload, message] of [
      ['clear', { unexpected: true }, 'invalid clear payload'],
      ['cancel', { tab: 'agent-1' }, 'invalid cancel payload'],
      ['focus-owner', {}, 'invalid focus-owner payload'],
      ['unknown', {}, 'unknown schedules intent "unknown"'],
    ] as const) {
      expect(() => intent(name, payload, fixture)).toThrow(new TabPluginRejection(message));
    }
    expect(fixture.actions).toEqual([]);
  });

  // The tab payload is the host's own record rather than client input, so a bad one means this
  // plugin produced something invalid.
  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities();
    let thrown: unknown;
    try {
      activate().intent(
        { tab: 'schedules', intent: 'clear', payload: {}, tabPayload: { nope: true } },
        fixture.capabilities,
      );
    } catch (error) { thrown = error; }
    expect(thrown).not.toBeInstanceOf(TabPluginRejection);
    expect((thrown as Error).message).toBe('invalid schedules tab payload');
  });
});

describe('schedules plugin opener', () => {
  // The manifest claims no extensions, so the open pipeline never routes here — but the contract
  // requires an opener, and it has to answer rather than silently pretend to have opened something.
  it('rejects both presentations, since this plugin opens on a command and not a file', () => {
    const fixture = fakeCapabilities();
    const opener = activate().opener;
    expect(() => opener.inline('/tmp/a.txt', fixture.capabilities))
      .toThrow(new TabPluginRejection('schedules opens no files'));
    expect(() => opener.external('/tmp/a.txt', fixture.capabilities))
      .toThrow(new TabPluginRejection('schedules opens no files'));
  });
});
