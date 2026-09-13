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
  const live = new Map<string, TabPluginPayload>();
  let current = data;
  const capabilities = {
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      if (live.has(key)) return;
      const value = factory();
      live.set(key, value);
      opened.push({ key, value });
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
  return { actions, capabilities, docks, opened, updated, live, data: () => current };
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

describe('conversations plugin default-menu entry', () => {
  it('creates one fresh conversation and opens its tab with the selection pasted unsent', () => {
    const value = fixture();
    activate().defaultMenuAction?.('selected text', value.capabilities);
    const created = value.actions[0];
    expect(created).toMatchObject({ topic: 'conversations', action: 'create' });
    expect(value.opened).toHaveLength(1);
    expect(value.opened[0].value.title).toBe('New conversation');
    const payload = value.opened[0].value.payload as { kind: string; draftQuery?: string };
    expect(payload.draftQuery).toBe('selected text');
    expect(payload.kind).toBe('conversation');
  });

  it('leaves the payload untouched when no draft is pasted', () => {
    const value = fixture();
    activate().command?.('', value.capabilities);
    expect(value.opened[0].value.payload).not.toHaveProperty('draftQuery');
  });
});

describe('initial conversation draft lifetime', () => {
  function draftFixture() {
    const value = fixture();
    const plugin = activate();
    const create = (draft: string) => {
      plugin.defaultMenuAction?.(draft, value.capabilities);
      return value.opened.at(-1)!;
    };
    const notify = () => plugin.notify?.({
      topic: 'conversations', data: value.data(), tabs: [...value.live.keys()],
    }, value.capabilities);
    const run = (intent: string, payload: unknown, tabPayload: unknown) => plugin.intent({
      tab: 'conversation-tab', intent, payload, tabPayload,
    }, value.capabilities);
    return { ...value, plugin, create, notify, run };
  }

  it('preserves separate selections through notifications before either composer mounts', () => {
    const value = draftFixture();
    const first = value.create('first selection\nwith a second line');
    value.notify();
    const second = value.create('second selection');
    value.notify();
    expect(value.updated.at(-2)).toMatchObject({
      key: first.key, value: { payload: { draftQuery: 'first selection\nwith a second line' } },
    });
    expect(value.updated.at(-1)).toMatchObject({
      key: second.key, value: { payload: { draftQuery: 'second selection' } },
    });
    expect(value.actions.every((action) => action.action === 'create')).toBe(true);
  });

  it('consumes only the acknowledged draft immediately and on subsequent notifications', () => {
    const value = draftFixture();
    const first = value.create('first selection');
    const second = value.create('second selection');
    expect(value.run('consume-draft', {}, first.value.payload)).toBeNull();
    expect(value.updated.at(-1)?.key).toBe(first.key);
    expect(value.updated.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
    const count = value.updated.length;
    expect(value.run('consume-draft', {}, first.value.payload)).toBeNull();
    expect(value.updated).toHaveLength(count);
    value.notify();
    expect(value.updated.at(-2)?.value.payload).not.toHaveProperty('draftQuery');
    expect(value.updated.at(-1)).toMatchObject({
      key: second.key, value: { payload: { draftQuery: 'second selection' } },
    });
    expect(value.actions).toHaveLength(2);
  });

  it('rejects malformed and list-tab acknowledgements without dropping the draft', () => {
    const value = draftFixture();
    const first = value.create('selection');
    expect(() => value.run('consume-draft', { query: 'selection' }, first.value.payload))
      .toThrow(new TabPluginRejection('invalid consume-draft payload'));
    expect(() => value.run('consume-draft', {}, { kind: 'list', entries: [] }))
      .toThrow(new TabPluginRejection('invalid consume-draft payload'));
    value.notify();
    expect(value.updated.at(-1)?.value.payload).toHaveProperty('draftQuery', 'selection');
  });

  it('clears the pending draft on a valid send, preserving it after an invalid send', () => {
    const value = draftFixture();
    const first = value.create('selection');
    expect(() => value.run('send', {}, first.value.payload))
      .toThrow(new TabPluginRejection('invalid send payload'));
    value.notify();
    expect(value.updated.at(-1)?.value.payload).toHaveProperty('draftQuery', 'selection');
    value.run('send', { query: 'edited selection' }, first.value.payload);
    expect(value.updated.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
    value.notify();
    expect(value.updated.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
    expect(value.actions.at(-1)).toEqual({
      topic: 'conversations', action: 'send', id: first.key, query: 'edited selection',
    });
  });

  it.each(['list', 'command'])('discards an unconsumed draft when a closed tab reopens via %s', (via) => {
    const value = draftFixture();
    const first = value.create('selection');
    value.live.delete(first.key);
    if (via === 'list') {
      value.run('open', { id: first.key }, { kind: 'list', entries: [] });
    } else {
      value.plugin.command?.('New conversation', value.capabilities);
    }
    expect(value.opened.at(-1)?.key).toBe(first.key);
    expect(value.opened.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
    value.notify();
    expect(value.updated.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
  });

  it('retains the draft when opening only focuses its existing tab', () => {
    const value = draftFixture();
    const first = value.create('selection');
    value.run('open', { id: first.key }, { kind: 'list', entries: [] });
    value.notify();
    expect(value.opened).toHaveLength(1);
    expect(value.updated.at(-1)?.value.payload).toHaveProperty('draftQuery', 'selection');
  });

  it('prunes closed instance drafts when another conversation notification arrives', () => {
    const value = draftFixture();
    const first = value.create('closed selection');
    const second = value.create('open selection');
    value.live.delete(first.key);
    value.notify();
    value.live.set(first.key, first.value);
    value.notify();
    expect(value.updated.at(-2)).toMatchObject({
      key: second.key, value: { payload: { draftQuery: 'open selection' } },
    });
    expect(value.updated.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
  });

  it('releases every pending draft on idempotent plugin disposal', () => {
    const value = draftFixture();
    value.create('selection');
    value.plugin.dispose?.();
    value.plugin.dispose?.();
    value.notify();
    expect(value.updated.at(-1)?.value.payload).not.toHaveProperty('draftQuery');
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
