import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { AggregatedScheduleView, RemoteSessionView } from '../protocol.js';
import { initDbDir } from '../connections.js';
import { DatabaseManager } from '../database/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginTopicAction,
  type TabPluginNotificationTopic,
} from './api.js';
import { createPluginContext } from './context.js';
import { readTopicData, runTopicAction, subscribeTopic } from './topics.js';
import { emitSessionsChanged } from '../remote/attach.js';
import { messageBus } from '../bus.js';

const ROWS: AggregatedScheduleView[] = [
  { tab: 'agent-1', id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: true, command: 'echo hi' },
];

// Two rows offering disjoint verbs, which is what the list actually composes: a live launching row
// carries `focus` and `detach`, a parked one carries `attach`, `end`, and `forget`. A single row
// claiming every verb would let a topic action pass no matter which arm authorised it.
const SESSION_ROWS: RemoteSessionView[] = [
  {
    id: 'claude', host: 'devbox', name: 'claude', kind: 'harness', state: 'active',
    activity: 1000, destination: 'devbox', workspace: '/srv/ws', joined: false,
    actions: ['focus', 'detach'], label: 'claude', session: 'session-1',
  },
  {
    id: 'bekir', host: 'devbox', name: 'bekir', kind: 'agent', state: 'active',
    activity: 950, destination: 'devbox', workspace: '/srv/ws', joined: true,
    actions: ['focus', 'close'], label: 'bekir', session: 'session-1',
  },
  {
    id: 'session-1:rpty1', host: 'devbox', name: 'parked', kind: 'harness', state: 'detached',
    activity: 900, destination: 'devbox', workspace: '/srv/ws', joined: false,
    actions: ['attach', 'terminate', 'forget'], label: 'parked', session: 'session-1',
  },
];

const origin = { label: 'janus', command: 'schedules' };

function declaration(
  capabilities: readonly TabPluginCapabilityName[],
  notifications?: readonly TabPluginNotificationTopic[],
): TabPluginDeclaration {
  return {
    id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
    tabLabelPrefix: 'fixture', fileExtensions: {}, notifications, capabilities,
  };
}

function makeManagers(rows: AggregatedScheduleView[] = ROWS) {
  const cancel = vi.fn();
  const clearAll = vi.fn();
  const setActiveTab = vi.fn();
  const tabs = [{ label: 'janus' }, { label: 'agent-1' }];
  const managers = {
    tab: {
      tabs,
      findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label),
      setActiveTab,
    },
    schedule: { aggregatedView: () => rows, cancel, clearAll },
    conversations: {
      view: vi.fn(() => ({ summaries: [], windows: [], models: [] })),
      create: vi.fn(), load: vi.fn(), loadOlder: vi.fn(), send: vi.fn(), cancel: vi.fn(),
      openFiles: vi.fn(), launchAgent: vi.fn(), selectModel: vi.fn(), rename: vi.fn(),
      delete: vi.fn(),
    },
    sessions: {
      view: vi.fn(() => SESSION_ROWS),
      // The real predicate's shape: a row has to name the target *and* offer the verb.
      offers: vi.fn((verb: string, { label, session }: { label?: string; session?: string }) => SESSION_ROWS.find(
        (row) => row.actions.includes(verb as RemoteSessionView['actions'][number])
          && (label === undefined || row.label === label)
          && (session === undefined || row.session === session),
      )),
      refresh: vi.fn(), detach: vi.fn(), attach: vi.fn(), terminate: vi.fn(), forget: vi.fn(),
      focus: vi.fn(), close: vi.fn(),
    },
    database: {
      readView: vi.fn(() => ({ databases: [{ name: 'shop', exists: true, open: true }], results: [], lastOpened: 'shop' })),
      browseCreate: vi.fn(), browseSchema: vi.fn(), browseQuery: vi.fn(), browseRun: vi.fn(),
      browseUpdateCell: vi.fn(), browseInsertRow: vi.fn(), browseDeleteRow: vi.fn(),
      browseStats: vi.fn(), browseExport: vi.fn(),
    },
  } as unknown as Managers;
  return { cancel, clearAll, managers, setActiveTab };
}

function contextFor(
  managers: Managers,
  capabilities: readonly TabPluginCapabilityName[] = ['topicData', 'topicAction'],
  notifications: readonly 'schedules'[] = ['schedules'],
) {
  return createPluginContext(
    managers,
    declaration(capabilities, notifications),
    { isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} } },
    origin,
    () => true,
  );
}

describe('the conversations topic source', () => {
  it('reads the manager view and routes every action', () => {
    const { managers } = makeManagers();
    expect(readTopicData(managers, 'conversations')).toEqual({
      summaries: [], windows: [], models: [],
    });
    const actions: TabPluginTopicAction[] = [
      { topic: 'conversations', action: 'create', id: 'one' },
      { topic: 'conversations', action: 'load', id: 'one' },
      { topic: 'conversations', action: 'loadOlder', id: 'one' },
      { topic: 'conversations', action: 'send', id: 'one', query: 'hello' },
      { topic: 'conversations', action: 'send', id: 'one', query: 'hello', context: 'selection' },
      { topic: 'conversations', action: 'cancel', id: 'one' },
      {
        topic: 'conversations', action: 'selectModel', id: 'one',
        harness: 'claude', model: 'sonnet',
      },
      { topic: 'conversations', action: 'rename', id: 'one', title: 'Parser notes' },
      { topic: 'conversations', action: 'delete', id: 'one' },
    ];
    for (const action of actions) runTopicAction(managers, action);
    expect(managers.conversations.create).toHaveBeenCalledWith('one');
    expect(managers.conversations.load).toHaveBeenCalledWith('one');
    expect(managers.conversations.loadOlder).toHaveBeenCalledWith('one');
    expect(managers.conversations.send).toHaveBeenCalledWith('one', 'hello', undefined);
    expect(managers.conversations.send).toHaveBeenCalledWith('one', 'hello', 'selection');
    expect(managers.conversations.cancel).toHaveBeenCalledWith('one');
    expect(managers.conversations.selectModel).toHaveBeenCalledWith(
      'one', { harness: 'claude', model: 'sonnet' },
    );
    expect(managers.conversations.rename).toHaveBeenCalledWith('one', 'Parser notes');
    expect(managers.conversations.delete).toHaveBeenCalledWith('one');
  });

  it('refuses a conversations action when the plugin did not declare the topic', () => {
    const { managers } = makeManagers();
    const capabilities = contextFor(managers, ['topicAction'], []);
    expect(() => capabilities.topicAction({
      topic: 'conversations', action: 'delete', id: 'one',
    })).toThrow('used topic "conversations" without declaring it');
    expect(managers.conversations.delete).not.toHaveBeenCalled();
  });

  it('routes workspace actions through the conversations manager', () => {
    const { managers } = makeManagers();
    runTopicAction(managers, { topic: 'conversations', action: 'openFiles', id: 'one' });
    runTopicAction(managers, { topic: 'conversations', action: 'launchAgent', id: 'one' });
    expect(managers.conversations.openFiles).toHaveBeenCalledWith('one');
    expect(managers.conversations.launchAgent).toHaveBeenCalledWith('one');
  });
});

describe('the databases topic source', () => {
  it('reads the browser view and routes every one of the nine actions', () => {
    const { managers } = makeManagers();
    expect(readTopicData(managers, 'databases')).toEqual({
      databases: [{ name: 'shop', exists: true, open: true }], results: [], lastOpened: 'shop',
    });
    const query = { object: 'orders', filters: [], order: [], limit: 100, offset: 0 };
    const actions: TabPluginTopicAction[] = [
      { topic: 'databases', action: 'create', database: 'shop', requestId: 'a' },
      { topic: 'databases', action: 'schema', database: 'shop', requestId: 'b' },
      { topic: 'databases', action: 'query', database: 'shop', requestId: 'c', query },
      { topic: 'databases', action: 'run', database: 'shop', requestId: 'd', sql: 'SELECT 1', returnsRows: true },
      { topic: 'databases', action: 'updateCell', database: 'shop', requestId: 'e', row: 'r1', column: 'status', value: null },
      { topic: 'databases', action: 'insertRow', database: 'shop', requestId: 'f', object: 'orders', cells: [{ column: 'id', value: null }] },
      { topic: 'databases', action: 'deleteRow', database: 'shop', requestId: 'g', row: 'r1' },
      { topic: 'databases', action: 'stats', database: 'shop', requestId: 'h', object: 'orders' },
      { topic: 'databases', action: 'export', database: 'shop', requestId: 'i', query, format: 'json' },
    ];
    for (const action of actions) runTopicAction(managers, action);
    expect(managers.database.browseCreate).toHaveBeenCalledWith('shop', 'a');
    expect(managers.database.browseSchema).toHaveBeenCalledWith('shop', 'b');
    expect(managers.database.browseQuery).toHaveBeenCalledWith('shop', 'c', query);
    expect(managers.database.browseRun).toHaveBeenCalledWith('shop', 'd', 'SELECT 1', true);
    expect(managers.database.browseUpdateCell).toHaveBeenCalledWith('shop', 'e', 'r1', 'status', null);
    expect(managers.database.browseInsertRow).toHaveBeenCalledWith('shop', 'f', 'orders', [{ column: 'id', value: null }]);
    expect(managers.database.browseDeleteRow).toHaveBeenCalledWith('shop', 'g', 'r1');
    expect(managers.database.browseStats).toHaveBeenCalledWith('shop', 'h', 'orders');
    expect(managers.database.browseExport).toHaveBeenCalledWith('shop', 'i', query, 'json');
  });

  // The request id is minted by the plugin and echoed by the host, and that round trip is the whole
  // addressing scheme: an answer stamped with an id of the host's own devising can never be matched
  // to the request that asked for it. Routing above proves each id reaches the manager; this proves
  // it survives the manager and comes back out on the answer.
  it('echoes the id the plugin minted back on the answer it produces', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'janus-topics-'));
    initDbDir(project);
    const managers = { database: new DatabaseManager() } as unknown as Managers;
    try {
      runTopicAction(managers, { topic: 'databases', action: 'create', database: 'shop', requestId: 'plugin-1' });
      runTopicAction(managers, { topic: 'databases', action: 'schema', database: 'shop', requestId: 'plugin-2' });
      const results = managers.database.readView().results;
      expect(results.map((result) => result.requestId)).toEqual(['plugin-2', 'plugin-1']);
      expect(results[1]?.kind).toBe('schema');
    } finally {
      managers.database.closeAll();
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('subscribes to the databases change signal rather than the state broadcast', () => {
    const fire = vi.fn();
    const subscription = subscribeTopic('databases', fire);
    messageBus.emit('databases', { type: 'changed' });
    expect(fire).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  // An action is fire-and-forget, so the emit after it is the whole of how an answer gets back to
  // the plugin that asked. Without it a request would be issued and never heard from again.
  it('emits the change signal once per action, whatever the action was', () => {
    const { managers } = makeManagers();
    const fire = vi.fn();
    const subscription = subscribeTopic('databases', fire);
    runTopicAction(managers, { topic: 'databases', action: 'schema', database: 'shop', requestId: 'a' });
    runTopicAction(managers, {
      topic: 'databases', action: 'query', database: 'shop', requestId: 'b',
      query: { object: 'orders', filters: [], order: [], limit: 100, offset: 0 },
    });
    expect(fire).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('refuses a databases action when the plugin did not declare the topic', () => {
    const { managers } = makeManagers();
    const capabilities = contextFor(managers, ['topicAction'], []);
    expect(() => capabilities.topicAction({
      topic: 'databases', action: 'schema', database: 'shop', requestId: 'a',
    })).toThrow('used topic "databases" without declaring it');
    expect(managers.database.browseSchema).not.toHaveBeenCalled();
  });

  it('gives a disabled plugin the topic own zero value rather than an array it never declared', () => {
    const { managers } = makeManagers();
    const capabilities = createPluginContext(
      managers,
      declaration(['topicData'], ['databases']),
      { isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} } },
      origin,
      () => false,
    );
    expect(capabilities.topicData('databases')).toEqual({ databases: [], results: [], lastOpened: null });
  });
});

describe('the sessions topic source', () => {
  it('reads the manager\'s row view', () => {
    const { managers } = makeManagers();
    expect(readTopicData(managers, 'sessions')).toEqual(SESSION_ROWS);
  });

  it('subscribes to the sessions change signal rather than the state broadcast', () => {
    const fire = vi.fn();
    const subscription = subscribeTopic('sessions', fire);
    messageBus.emit('sessions', { type: 'changed' });
    expect(fire).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  // What makes an open list live rather than merely correct at the moment it was drawn: the channel
  // lifecycle raises the same signal the row actions do, so a launch, a join, or a lost transport
  // reaches the tab without anyone pressing Refresh.
  it('fires for a channel lifecycle signal, not only for a row action', () => {
    const fire = vi.fn();
    const subscription = subscribeTopic('sessions', fire);
    emitSessionsChanged();
    expect(fire).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it.each([
    { action: { topic: 'sessions', action: 'detach', label: 'claude' }, method: 'detach' },
    { action: { topic: 'sessions', action: 'focus', label: 'claude' }, method: 'focus' },
    { action: { topic: 'sessions', action: 'close', label: 'bekir' }, method: 'close' },
    { action: { topic: 'sessions', action: 'attach', session: 'session-1' }, method: 'attach' },
    { action: { topic: 'sessions', action: 'terminate', session: 'session-1' }, method: 'terminate' },
    { action: { topic: 'sessions', action: 'forget', session: 'session-1' }, method: 'forget' },
  ] as const)('routes $method to the manager', ({ action, method }) => {
    const { managers } = makeManagers();
    runTopicAction(managers, action as TabPluginTopicAction);
    expect(managers.sessions[method]).toHaveBeenCalledOnce();
  });

  // Refresh re-reads local state and opens no ssh connection, so it needs no row to act on.
  it('routes refresh without naming any row', () => {
    const { managers } = makeManagers();
    runTopicAction(managers, { topic: 'sessions', action: 'refresh' });
    expect(managers.sessions.refresh).toHaveBeenCalledOnce();
  });

  // The narrowing `focusOwner` already applies, extended to every session verb: a plugin may act on
  // what the host agreed to show it, and on nothing else.
  it.each([
    { what: 'a tab the view does not hold', action: { topic: 'sessions', action: 'detach', label: 'ghost' }, method: 'detach' },
    { what: 'a tab the view does not hold', action: { topic: 'sessions', action: 'close', label: 'ghost' }, method: 'close' },
    { what: 'a session the view does not hold', action: { topic: 'sessions', action: 'attach', session: 'ghost' }, method: 'attach' },
    { what: 'a session the view does not hold', action: { topic: 'sessions', action: 'terminate', session: 'ghost' }, method: 'terminate' },
    { what: 'a session the view does not hold', action: { topic: 'sessions', action: 'forget', session: 'ghost' }, method: 'forget' },
  ] as const)('refuses $method naming $what', ({ action, method }) => {
    const { managers } = makeManagers();
    runTopicAction(managers, action as TabPluginTopicAction);
    expect(managers.sessions[method]).not.toHaveBeenCalled();
  });

  // Naming a row the view holds is not enough — the row has to offer the verb. A parked row's label
  // is a recorded name belonging to no live tab, so `close` on one used to reach whatever tab
  // happened to share it, even though that row offers only `attach`.
  it.each([
    { what: 'close on a parked row', action: { topic: 'sessions', action: 'close', label: 'parked' }, method: 'close' },
    { what: 'detach on a parked row', action: { topic: 'sessions', action: 'detach', label: 'parked' }, method: 'detach' },
    { what: 'close on a launching row', action: { topic: 'sessions', action: 'close', label: 'claude' }, method: 'close' },
    { what: 'detach on a joined row', action: { topic: 'sessions', action: 'detach', label: 'bekir' }, method: 'detach' },
  ] as const)('refuses $what, which that row does not offer', ({ action, method }) => {
    const { managers } = makeManagers();
    runTopicAction(managers, action as TabPluginTopicAction);
    expect(managers.sessions[method]).not.toHaveBeenCalled();
  });
});

describe('the schedules topic source', () => {
  it('reads the aggregated rows the host already computes', () => {
    const { managers } = makeManagers();
    expect(readTopicData(managers, 'schedules')).toEqual(ROWS);
  });

  it('routes cancel and clear to the schedule manager', () => {
    const { cancel, clearAll, managers } = makeManagers();

    runTopicAction(managers, { topic: 'schedules', action: 'cancel', tab: 'agent-1', id: 'fetch' });
    runTopicAction(managers, { topic: 'schedules', action: 'clear' });

    expect(cancel).toHaveBeenCalledWith('agent-1', 'fetch');
    expect(clearAll).toHaveBeenCalled();
  });

  it('focuses the tab a row belongs to', () => {
    const { managers, setActiveTab } = makeManagers();

    runTopicAction(managers, { topic: 'schedules', action: 'focusOwner', tab: 'agent-1' });

    expect(setActiveTab).toHaveBeenCalledWith(1);
  });

  // The narrowing that keeps `focusOwner` from being a focus-anything grant: a tab that owns no row
  // in the topic's own data is not something the plugin is showing, so it is not something it can
  // reach for.
  it('refuses to focus a tab that owns no row', () => {
    const { managers, setActiveTab } = makeManagers([]);

    runTopicAction(managers, { topic: 'schedules', action: 'focusOwner', tab: 'agent-1' });

    expect(setActiveTab).not.toHaveBeenCalled();
  });
});

describe('the topicData and topicAction capabilities', () => {
  it('hand a declared topic\'s current data to the plugin', () => {
    const { managers } = makeManagers();
    expect(contextFor(managers).topicData('schedules')).toEqual(ROWS);
  });

  it('perform a declared topic\'s named action', () => {
    const { clearAll, managers } = makeManagers();

    contextFor(managers).topicAction({ topic: 'schedules', action: 'clear' });

    expect(clearAll).toHaveBeenCalled();
  });

  // Reaching for a topic the manifest never named is a plugin-authoring mistake, exactly like using
  // an undeclared capability, so it fails the same way rather than answering the caller.
  it('throw for a topic the declaration never named', () => {
    const { clearAll, managers } = makeManagers();
    const capabilities = contextFor(managers, ['topicData', 'topicAction'], []);
    const action: TabPluginTopicAction = { topic: 'schedules', action: 'clear' };

    expect(() => capabilities.topicData('schedules'))
      .toThrow('used topic "schedules" without declaring it');
    expect(() => { capabilities.topicAction(action); })
      .toThrow('used topic "schedules" without declaring it');
    expect(clearAll).not.toHaveBeenCalled();
  });

  it('throw when the capability itself was not declared', () => {
    const { managers } = makeManagers();
    const capabilities = contextFor(managers, []);

    expect(() => capabilities.topicData('schedules'))
      .toThrow('used capability "topicData" without declaring it');
    expect(() => { capabilities.topicAction({ topic: 'schedules', action: 'clear' }); })
      .toThrow('used capability "topicAction" without declaring it');
  });
});
