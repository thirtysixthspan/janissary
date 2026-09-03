import { describe, expect, it } from 'vitest';
import type { ConversationsView } from '../../protocol.js';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';

const DATA: ConversationsView = {
  summaries: [{ id: 'first', title: 'First conversation', updatedAt: 2 }],
  windows: [{
    id: 'first', title: 'First conversation',
    pair: { harness: 'opencode', model: 'google/gemini' },
    turns: [], hasOlder: false,
  }],
  models: [{ harness: 'opencode', model: 'google/gemini' }],
};

function fixture(data: ConversationsView = DATA) {
  const opened: Array<{ key: string; value: TabPluginPayload }> = [];
  const updated: Array<{ key: string; value: TabPluginTabUpdate }> = [];
  const docks: Array<{ key: string; dock: 'left' | 'right' | null }> = [];
  const actions: TabPluginTopicAction[] = [];
  let current = data;
  const capabilities = {
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      opened.push({ key, value: factory() });
    },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => {
      updated.push({ key, value: factory() });
    },
    dockTab: (key: string, dock: 'left' | 'right' | null) => { docks.push({ key, dock }); },
    topicData: () => current,
    topicAction: (action: TabPluginTopicAction) => {
      actions.push(action);
      if (action.topic === 'conversations' && action.action === 'create') {
        const window = { ...DATA.windows[0], id: action.id, title: 'New conversation' };
        current = {
          ...current,
          summaries: [...current.summaries, { id: action.id, title: window.title, updatedAt: 3 }],
          windows: [...current.windows, window],
        };
      }
    },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, docks, opened, updated };
}

describe('conversations plugin command', () => {
  it('opens and focuses the singleton list', () => {
    const value = fixture();
    activate().command?.('', value.capabilities);
    expect(value.opened).toEqual([{
      key: 'conversations',
      value: { title: 'conversations', payload: { kind: 'list', entries: DATA.summaries } },
    }]);
  });

  it('docks left or right and undocks on a bare command', () => {
    const left = fixture();
    activate().command?.('left', left.capabilities);
    expect(left.docks).toEqual([{ key: 'conversations', dock: 'left' }]);
    const right = fixture();
    activate().command?.('right', right.capabilities);
    expect(right.docks).toEqual([{ key: 'conversations', dock: 'right' }]);
    const bare = fixture();
    activate().command?.('', bare.capabilities);
    expect(bare.docks).toEqual([{ key: 'conversations', dock: null }]);
  });

  it('opens a case-insensitive title match and reports a miss', () => {
    const value = fixture();
    activate().command?.('first CONVERSATION', value.capabilities);
    expect(value.actions).toContainEqual({ topic: 'conversations', action: 'load', id: 'first' });
    expect(value.opened[0]).toMatchObject({ key: 'first', value: { title: 'First conversation' } });

    expect(() => activate().command?.('missing', value.capabilities))
      .toThrow(new TabPluginRejection('No conversation matching "missing".'));
  });
});

describe('conversations plugin intents', () => {
  const list = { kind: 'list' as const, entries: DATA.summaries };
  const conversation = {
    kind: 'conversation' as const, conversation: DATA.windows[0], models: DATA.models,
  };
  const run = (
    name: string, payload: unknown, tabPayload: unknown, value: ReturnType<typeof fixture>,
  ) => activate().intent({ tab: 'conversations', intent: name, payload, tabPayload }, value.capabilities);

  it('maps every intent to its conversation topic action', () => {
    const value = fixture();
    expect(run('create', {}, list, value)).toBeNull();
    const created = value.actions[0];
    expect(created).toMatchObject({ topic: 'conversations', action: 'create' });
    expect(run('open', { id: 'first' }, list, value)).toBeNull();
    expect(run('load-older', {}, conversation, value)).toBeNull();
    expect(run('send', { query: 'hello' }, conversation, value)).toBeNull();
    expect(run('cancel', {}, conversation, value)).toBeNull();
    expect(run('select-model', { harness: 'opencode', model: 'model' }, conversation, value))
      .toBeNull();
    expect(run('delete', { id: 'first' }, list, value)).toBeNull();
    expect(value.actions.slice(1)).toEqual([
      { topic: 'conversations', action: 'load', id: 'first' },
      { topic: 'conversations', action: 'loadOlder', id: 'first' },
      { topic: 'conversations', action: 'send', id: 'first', query: 'hello' },
      { topic: 'conversations', action: 'cancel', id: 'first' },
      {
        topic: 'conversations', action: 'selectModel', id: 'first',
        harness: 'opencode', model: 'model',
      },
      { topic: 'conversations', action: 'delete', id: 'first' },
    ]);
  });

  it('rejects malformed intent payloads without reporting plugin failure', () => {
    const value = fixture();
    expect(() => run('send', {}, conversation, value))
      .toThrow(new TabPluginRejection('invalid send payload'));
    expect(() => run('unknown', {}, conversation, value))
      .toThrow(new TabPluginRejection('unknown conversations intent "unknown"'));
  });

  it('maps workspace intents to their narrow conversation actions', () => {
    const value = fixture();
    expect(run('open-files', {}, conversation, value)).toBeNull();
    expect(run('launch-agent', {}, conversation, value)).toBeNull();
    expect(value.actions).toEqual([
      { topic: 'conversations', action: 'openFiles', id: 'first' },
      { topic: 'conversations', action: 'launchAgent', id: 'first' },
    ]);
  });

  it('maps a rename to its conversation topic action', () => {
    const value = fixture();
    expect(run('rename', { title: 'Parser notes' }, conversation, value)).toBeNull();
    expect(value.actions).toEqual([
      { topic: 'conversations', action: 'rename', id: 'first', title: 'Parser notes' },
    ]);
  });

  it('rejects a rename without a title, and one raised from the list tab', () => {
    const value = fixture();
    expect(() => run('rename', {}, conversation, value))
      .toThrow(new TabPluginRejection('invalid rename payload'));
    expect(() => run('rename', { title: 'Parser notes' }, list, value))
      .toThrow(new TabPluginRejection('invalid rename payload'));
    expect(value.actions).toEqual([]);
  });

  it('reports an invalid authoritative tab payload as a failure', () => {
    const value = fixture();
    expect(() => run('send', { query: 'hello' }, { broken: true }, value))
      .toThrow('invalid conversations tab payload');
  });
});

describe('conversations plugin notifications', () => {
  it('updates the list and each open conversation tab', () => {
    const value = fixture();
    activate().notify?.({ topic: 'conversations', data: DATA, tabs: ['conversations', 'first'] }, value.capabilities);
    expect(value.updated).toEqual([
      { key: 'conversations', value: { payload: { kind: 'list', entries: DATA.summaries } } },
      {
        key: 'first',
        value: {
          title: 'First conversation',
          payload: { kind: 'conversation', conversation: DATA.windows[0], models: DATA.models },
        },
      },
    ]);
  });
});
