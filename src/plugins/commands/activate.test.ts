import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type CommandsTopicNotification,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';
import type { CommandsPayload } from './shared.js';

const DATA: CommandsTopicNotification['data'] = {
  commands: [
    { name: 'agent', kind: 'builtin', aliases: [], forms: ['agent'], enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'ask', kind: 'builtin', aliases: [], forms: ['ask'], enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'ask', kind: 'builtin', aliases: [], forms: ['ask reset'], parent: 'ask', enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'browser goto', kind: 'native', aliases: [], forms: ['browser goto'], parent: 'browser', nativeTool: 'browser', enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'close', kind: 'builtin', aliases: ['exit'], forms: ['close'], enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'commands', kind: 'plugin', aliases: [], forms: ['commands'], enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'db', kind: 'builtin', aliases: [], forms: ['db', 'db sqlite'], enabled: false, agentAccess: true, effectiveEnabled: false, effectiveAgentAccess: true },
    { name: 'db sqlite query', kind: 'native', aliases: [], forms: ['db sqlite query'], parent: 'db', nativeTool: 'database', enabled: true, agentAccess: true, effectiveEnabled: false, effectiveAgentAccess: false },
    { name: 'quit', kind: 'builtin', aliases: [], forms: ['quit'], enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'question', kind: 'builtin', aliases: [], forms: ['question ask', 'question approve'], enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'question ask', kind: 'native', aliases: [], forms: ['question ask'], parent: 'question', nativeTool: 'question', enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
    { name: 'question approve', kind: 'native', aliases: [], forms: ['question approve'], parent: 'question', nativeTool: 'question', enabled: true, agentAccess: true, effectiveEnabled: true, effectiveAgentAccess: true },
  ],
  source: 'home',
  path: '/home/me/.janissary/commands.json',
};

const TAB_PAYLOAD: CommandsPayload = { commands: [], source: 'home', path: '/home/me/.janissary/commands.json' };

function fixture(data: unknown = DATA, setResult?: string | Promise<string | undefined>) {
  const order: string[] = [];
  const actions: TabPluginTopicAction[] = [];
  const opened: { key: string; payload: TabPluginPayload }[] = [];
  const updated: { key: string; update: TabPluginTabUpdate }[] = [];
  const dockTab = vi.fn();
  const closeOwnTab = vi.fn();
  const capabilities = {
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      order.push('open');
      opened.push({ key, payload: factory() });
    },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => {
      updated.push({ key, update: factory() });
    },
    dockTab,
    closeOwnTab,
    topicData: () => {
      order.push('topicData');
      return data;
    },
    topicAction: ((action: TabPluginTopicAction) => {
      actions.push(action);
      order.push(`${action.topic}:${action.action}`);
      return action.topic === 'commands' && action.action === 'set' ? setResult : undefined;
    }) as unknown as TabPluginServerCapabilities['topicAction'],
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, closeOwnTab, dockTab, opened, order, updated };
}

function payloadFrom(result: { opened: { payload: TabPluginPayload }[] }): CommandsPayload {
  return result.opened[0].payload.payload as CommandsPayload;
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function setIntent(name: string, payload: unknown, test: ReturnType<typeof fixture>) {
  return activate().intent({ tab: 'commands', intent: name, payload, tabPayload: TAB_PAYLOAD }, test.capabilities);
}

describe('commands activation command', () => {
  it('refreshes before reading and opens the singleton tab with the mapped payload', () => {
    const test = fixture();

    activate().command?.('', test.capabilities);

    expect(test.order.slice(0, 3)).toEqual(['commands:refresh', 'topicData', 'open']);
    expect(test.opened[0].key).toBe('commands');
    expect(test.opened[0].payload.title).toBe('commands');
    expect(test.dockTab).not.toHaveBeenCalled();
    const payload = payloadFrom(test);
    expect(payload.source).toBe('home');
    expect(payload.path).toBe(DATA.path);
    expect(payload.commands.find((row) => row.name === 'ask' && row.label === 'ask reset')).toEqual({
      name: 'ask',
      label: 'ask reset',
      enabled: true,
      agentAccess: true,
      effectiveEnabled: true,
      effectiveAgentAccess: true,
    });
    expect(payload.commands.find((row) => row.name === 'db sqlite query'))
      .toMatchObject({ label: 'db sqlite query', parent: 'db', nativeTool: 'database' });
    expect(payload.commands.find((row) => row.name === 'commands')).toEqual({
      name: 'commands',
      label: 'commands',
      enabled: true,
      agentAccess: true,
      effectiveEnabled: true,
      effectiveAgentAccess: true,
    });
  });

  it('uses the same instance key on a second bare run, so the host focuses the open tab', () => {
    const test = fixture();

    activate().command?.('', test.capabilities);
    activate().command?.('', test.capabilities);

    expect(test.opened.map((entry) => entry.key)).toEqual(['commands', 'commands']);
  });

  it('reports a failure and opens nothing when bare commands finds invalid topic data', () => {
    const test = fixture({ commands: 'nope' });

    const error = thrownBy(() => activate().command?.('', test.capabilities));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TabPluginRejection);
    expect((error as Error).message).toBe('invalid commands topic data');
    expect(test.opened).toEqual([]);
  });

  it('reports the same failure for an edit form without a topic action', () => {
    const test = fixture({ commands: 'nope' });

    const error = thrownBy(() => activate().command?.('disable quit', test.capabilities));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('invalid commands topic data');
    expect(test.actions).toEqual([]);
  });

  it('reads the topic, sends the canonical name and setting, and opens nothing for an edit', async () => {
    const test = fixture();

    await activate().command?.('disable agent', test.capabilities);

    expect(test.order).toEqual(['topicData', 'commands:set']);
    expect(test.actions).toEqual([{
      topic: 'commands', action: 'set', name: 'agent', setting: 'enabled', value: false,
    }]);
    expect(test.opened).toEqual([]);
  });

  it('maps the agent selector to the agent-access setting', async () => {
    const test = fixture();

    await activate().command?.('enable agent browser goto', test.capabilities);

    expect(test.actions).toEqual([{
      topic: 'commands', action: 'set', name: 'browser goto', setting: 'agentAccess', value: true,
    }]);
  });

  it('resolves aliases and fixed forms to the canonical name', async () => {
    const test = fixture();

    await activate().command?.('disable exit', test.capabilities);
    await activate().command?.('disable ask reset', test.capabilities);

    expect(test.actions).toEqual([
      { topic: 'commands', action: 'set', name: 'close', setting: 'enabled', value: false },
      { topic: 'commands', action: 'set', name: 'ask', setting: 'enabled', value: false },
    ]);
  });

  it('sends the native question ask name instead of the builtin question form', async () => {
    const test = fixture();

    await activate().command?.('enable question ask', test.capabilities);
    await activate().command?.('disable agent question ask', test.capabilities);

    expect(test.actions).toEqual([
      { topic: 'commands', action: 'set', name: 'question ask', setting: 'enabled', value: true },
      { topic: 'commands', action: 'set', name: 'question ask', setting: 'agentAccess', value: false },
    ]);
  });

  it('sends a child canonical name even when its parent is disabled', async () => {
    const test = fixture();

    await activate().command?.('disable db sqlite query', test.capabilities);

    expect(test.actions).toEqual([{
      topic: 'commands', action: 'set', name: 'db sqlite query', setting: 'enabled', value: false,
    }]);
  });

  it('rejects with the topic refusal', async () => {
    const test = fixture(DATA, Promise.resolve('Not a native ACP command: agent.'));

    const result = activate().command?.('disable agent agent', test.capabilities);

    await expect(result).rejects.toThrow(new TabPluginRejection('Not a native ACP command: agent.'));
  });

  it('rejects malformed forms and unknown names with their exact replies', () => {
    const test = fixture();

    expect(() => activate().command?.('left', test.capabilities))
      .toThrow(new TabPluginRejection('Usage: commands [enable|disable [agent|global] <command>].'));
    expect(() => activate().command?.('disable quit now', test.capabilities))
      .toThrow(new TabPluginRejection('Unknown application command: quit now.'));
  });
});

describe('commands activation notifications', () => {
  it('repaints the singleton tab from a commands topic delivery with no title', () => {
    const test = fixture();

    activate().notify?.({ topic: 'commands', data: DATA, tabs: ['commands'] }, test.capabilities);

    expect(test.updated).toHaveLength(1);
    expect(test.updated[0].key).toBe('commands');
    expect(test.updated[0].update.title).toBeUndefined();
    expect((test.updated[0].update.payload as CommandsPayload).commands).toHaveLength(DATA.commands.length);
  });

  it('ignores invalid data and other topics', () => {
    const test = fixture();
    const invalid = { commands: 'nope' } as unknown as CommandsTopicNotification['data'];

    activate().notify?.({ topic: 'commands', data: invalid, tabs: ['commands'] }, test.capabilities);
    activate().notify?.({ topic: 'models', data: DATA, tabs: ['commands'] } as never, test.capabilities);

    expect(test.updated).toEqual([]);
  });
});

describe('commands activation intents', () => {
  it('returns null after a successful set', async () => {
    const test = fixture(DATA, Promise.resolve(undefined));

    await expect(setIntent('set', { name: 'quit', setting: 'enabled', value: false }, test)).resolves.toBeNull();
    expect(test.actions).toEqual([{
      topic: 'commands', action: 'set', name: 'quit', setting: 'enabled', value: false,
    }]);
  });

  it('rejects with the topic refusal', async () => {
    const test = fixture(DATA, Promise.resolve('Not a native ACP command: agent.'));

    await expect(setIntent('set', { name: 'agent', setting: 'agentAccess', value: false }, test))
      .rejects.toThrow(new TabPluginRejection('Not a native ACP command: agent.'));
  });

  it('sends a set for commands itself without closing the tab', async () => {
    const test = fixture(DATA, Promise.resolve(undefined));

    await expect(setIntent('set', { name: 'commands', setting: 'enabled', value: false }, test)).resolves.toBeNull();

    expect(test.actions).toEqual([{
      topic: 'commands', action: 'set', name: 'commands', setting: 'enabled', value: false,
    }]);
    expect(test.closeOwnTab).not.toHaveBeenCalled();
    expect(test.updated).toEqual([]);
  });

  it('rejects an unknown intent and an invalid payload', () => {
    const test = fixture();

    expect(() => setIntent('nope', {}, test))
      .toThrow(new TabPluginRejection('unknown commands intent "nope"'));
    expect(() => setIntent('set', { name: '', setting: 'enabled', value: true }, test))
      .toThrow(new TabPluginRejection('invalid set payload'));
    expect(test.actions).toEqual([]);
  });
});
