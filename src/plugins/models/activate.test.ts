import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type ModelsTopicNotification,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';
import type { ModelsPayload } from './shared.js';

const DATA: ModelsTopicNotification['data'] = {
  groups: [
    { key: 'claude', heading: 'Anthropic', records: [{ id: 'claude-4', name: 'Claude 4' }] },
    { key: 'opencode:google', heading: 'Google', records: [{ id: 'google/gemini', name: 'Gemini', disabled: true }] },
  ],
  refreshing: true,
};

function fixture(deleteResult?: Promise<string | undefined>) {
  const order: string[] = [];
  const actions: TabPluginTopicAction[] = [];
  const opened: { key: string; payload: TabPluginPayload }[] = [];
  const updated: { key: string; update: TabPluginTabUpdate }[] = [];
  const docks: Array<'left' | 'right' | null> = [];
  const capabilities = {
    note: vi.fn(),
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      order.push('open');
      opened.push({ key, payload: factory() });
    },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => {
      updated.push({ key, update: factory() });
    },
    dockTab: (_key: string, dock: 'left' | 'right' | null) => { docks.push(dock); },
    openClaimedFiles: vi.fn(),
    topicData: () => { order.push('topicData'); return DATA; },
    topicAction: ((action: TabPluginTopicAction) => {
      actions.push(action);
      order.push(`${action.topic}:${action.action}`);
      return action.action === 'delete' ? deleteResult : undefined;
    }) as unknown as TabPluginServerCapabilities['topicAction'],
    configuredViewer: () => '',
    openExternally: () => false,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, docks, opened, order, updated };
}

function payloadFrom(result: { opened: { payload: TabPluginPayload }[] }): ModelsPayload {
  return result.opened[0].payload.payload as ModelsPayload;
}

function deleteRequest(activation: ReturnType<typeof activate>, capabilities: TabPluginServerCapabilities) {
  return activation.intent({
    tab: 'models',
    intent: 'delete',
    payload: { harness: 'opencode', id: 'google/gemini' },
    tabPayload: { groups: [], refreshing: false },
  }, capabilities);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- keep the fixture on the project target.
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('models activation command', () => {
  it('reloads before reading and maps topic groups into tab rows', () => {
    const test = fixture();

    activate().command?.('left', test.capabilities);

    expect(test.order.slice(0, 3)).toEqual(['models:reload', 'topicData', 'open']);
    expect(test.docks).toEqual(['left']);
    expect(test.opened[0].key).toBe('models');
    expect(test.opened[0].payload.title).toBe('models');
    expect(payloadFrom(test)).toEqual({
      groups: [
        { label: 'Anthropic', rows: [{ harness: 'claude', id: 'claude-4', name: 'Claude 4', disabled: false }] },
        { label: 'Google', rows: [{ harness: 'opencode', id: 'google/gemini', name: 'Gemini', disabled: true }] },
      ],
      refreshing: true,
    });
  });

  it('rejects unsupported command arguments with the existing list usage', () => {
    const test = fixture();
    expect(() => activate().command?.('center', test.capabilities))
      .toThrow(new TabPluginRejection('Usage: models [left|right]'));
  });

  it.each([
    { argument: 'right', dock: 'right' },
    { argument: '', dock: null },
  ] as const)('supports command argument "$argument" with dock $dock', ({ argument, dock }) => {
    const test = fixture();
    activate().command?.(argument, test.capabilities);
    expect(test.docks).toEqual([dock]);
  });
});

describe('models activation notifications and intents', () => {
  it('updates the singleton tab from a models topic delivery', () => {
    const test = fixture();
    activate().notify?.({ topic: 'models', data: DATA, tabs: ['models'] }, test.capabilities);

    expect(test.updated).toHaveLength(1);
    expect(test.updated[0].key).toBe('models');
    expect(test.updated[0].update.payload).toEqual({
      groups: [
        { label: 'Anthropic', rows: [{ harness: 'claude', id: 'claude-4', name: 'Claude 4', disabled: false }] },
        { label: 'Google', rows: [{ harness: 'opencode', id: 'google/gemini', name: 'Gemini', disabled: true }] },
      ],
      refreshing: true,
    });
  });

  it('starts Refresh without awaiting the provider work', () => {
    const test = fixture();
    const result = activate().intent({
      tab: 'models', intent: 'refresh', payload: {}, tabPayload: { groups: [], refreshing: false },
    }, test.capabilities);
    expect(result).toBeNull();
    expect(test.actions).toEqual([{ topic: 'models', action: 'refresh' }]);
  });

  it('awaits the Delete result before forwarding a refusal', async () => {
    const pending = deferred<string | undefined>();
    const test = fixture(pending.promise);
    const result = deleteRequest(activate(), test.capabilities);
    expect(test.actions).toEqual([{
      topic: 'models', action: 'delete', harness: 'opencode', id: 'google/gemini',
    }]);
    pending.resolve('no model "opencode google/gemini"');
    await expect(result).rejects.toThrow(new TabPluginRejection('no model "opencode google/gemini"'));
  });

  it('returns null after a successful Delete', async () => {
    const test = fixture(Promise.resolve(undefined));
    await expect(deleteRequest(activate(), test.capabilities)).resolves.toBeNull();
  });
});
