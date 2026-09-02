import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { AggregatedScheduleView } from '../protocol.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginTopicAction,
  type TabPluginNotificationTopic,
} from './api.js';
import { createPluginContext } from './context.js';
import { readTopicData, runTopicAction } from './topics.js';

const ROWS: AggregatedScheduleView[] = [
  { tab: 'agent-1', id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: true, command: 'echo hi' },
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
      selectModel: vi.fn(), delete: vi.fn(),
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
      { topic: 'conversations', action: 'cancel', id: 'one' },
      {
        topic: 'conversations', action: 'selectModel', id: 'one',
        harness: 'claude', model: 'sonnet',
      },
      { topic: 'conversations', action: 'delete', id: 'one' },
    ];
    for (const action of actions) runTopicAction(managers, action);
    expect(managers.conversations.create).toHaveBeenCalledWith('one');
    expect(managers.conversations.load).toHaveBeenCalledWith('one');
    expect(managers.conversations.loadOlder).toHaveBeenCalledWith('one');
    expect(managers.conversations.send).toHaveBeenCalledWith('one', 'hello');
    expect(managers.conversations.cancel).toHaveBeenCalledWith('one');
    expect(managers.conversations.selectModel).toHaveBeenCalledWith(
      'one', { harness: 'claude', model: 'sonnet' },
    );
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
