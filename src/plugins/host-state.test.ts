import { describe, expect, it, vi, afterEach } from 'vitest';
import { messageBus } from '../bus.js';
import { subscribeTabPluginHostState, type TabPluginHostStatePort } from './host-state.js';
import type { TabPluginActivation, TabPluginServerCapabilities } from './api.js';
import type { PluginRecord } from './status.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

function pluginTab(label: string, instanceKey: string, payload?: unknown): Tab {
  const held = payload ?? { ptyId: 'pty1' };
  return {
    label,
    plugin: { id: 'shell', instanceKey, schemaVersion: 1, payload: held, fileRefs: [], sourceLabel: 'agent1' },
  } as unknown as Tab;
}

function makePort(overrides: {
  tabs?: Tab[];
  // Which slices the declaration claims, or `null` for a plugin that claims none at all.
  slices?: ('connections' | 'schedule')[] | null;
  connections?: Record<string, { text: string; kind: 'terminal' }[]>;
  schedule?: Record<string, { id: string; spec: string; next: string; recurring: boolean }[]>;
} = {}) {
  const connections = overrides.connections ?? {};
  const schedule = overrides.schedule ?? {};
  const slices = overrides.slices === undefined ? ['connections', 'schedule'] : overrides.slices;
  const handler = vi.fn();
  // One record object for the life of the port, because the delivery remembers what it last pushed
  // against it — a records() that built a fresh one per call would look like a plugin whose rows had
  // never been pushed, and would therefore deliver on every signal.
  const record = {
    declaration: { id: 'shell', ...(slices && { hostState: slices }) },
    state: 'active',
    activation: { hostState: handler } as unknown as TabPluginActivation,
  } as unknown as PluginRecord;
  const port = {
    managers: { tab: { tabs: overrides.tabs ?? [] } } as unknown as Managers,
    records: () => [record],
    timeoutMs: 1000,
    connectionsFor: (label: string) => connections[label] ?? [],
    scheduleView: (label: string) => schedule[label] ?? [],
    invoke: (_record, _activation, _origin, call: (c: TabPluginServerCapabilities) => void) => {
      void call({} as TabPluginServerCapabilities);
      return Promise.resolve({ status: 'ok' as const, value: undefined });
    },
    disable: vi.fn(),
  } as unknown as TabPluginHostStatePort;
  return { handler, port, record };
}

// The delivery is subscribed to the application's own `state: dirty` signal — the one that fires on
// essentially every mutation — which is exactly why it compares before it calls anything. The bus is
// module-level and shared, so every subscription a case takes out is released again: one left behind
// would answer the next case's signal and make a count mean nothing.
const taken: { unsubscribe: () => void }[] = [];

afterEach(() => {
  while (taken.length > 0) taken.pop()?.unsubscribe();
});

function subscribe(port: TabPluginHostStatePort) {
  taken.push(...subscribeTabPluginHostState(port));
}

function fireState() {
  messageBus.emit('state', { type: 'dirty' });
}

describe('host state delivery', () => {
  it('takes no subscription at all when no declaration names a slice', () => {
    const { port } = makePort({ slices: null });

    expect(subscribeTabPluginHostState(port)).toEqual([]);
  });

  it('delivers both slices for a tab, addressed by instance key and carrying its payload', () => {
    const payload = { ptyId: 'pty1' };
    const { handler, port } = makePort({
      tabs: [pluginTab('shell1', 'shell-1', payload)],
      connections: { shell1: [{ text: 'zsh', kind: 'terminal' }] },
      schedule: { shell1: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }] },
    });

    subscribe(port);
    fireState();

    // The payload rides along so a handler can merge rather than replace: only the plugin knows which
    // fields are its own, and an update replaces the whole thing.
    expect(handler).toHaveBeenCalledWith({
      instanceKey: 'shell-1',
      tabPayload: payload,
      connections: [{ text: 'zsh', kind: 'terminal' }],
      schedule: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }],
    }, expect.anything());
  });

  it('delivers once for a tab and then not at all while nothing about it changes', () => {
    const { handler, port } = makePort({
      tabs: [pluginTab('shell1', 'shell-1')],
      connections: { shell1: [{ text: 'zsh', kind: 'terminal' }] },
    });

    subscribe(port);
    fireState();
    expect(handler).toHaveBeenCalledTimes(1);

    fireState();
    fireState();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('delivers once even when its own handler emits the signal being dispatched', () => {
    // A handler that merges rows with `updateTab` brings the whole chain back round: `updateTab`
    // emits `state: dirty` inline and `messageBus.emit` is synchronous. The fingerprint has to be on
    // record before the delivery starts, or the re-entrant pass sees a tab that was never pushed and
    // delivers again, for as long as the handler keeps emitting.
    const { handler, port } = makePort({
      tabs: [pluginTab('shell1', 'shell-1')],
      connections: { shell1: [{ text: 'zsh', kind: 'terminal' }] },
    });
    handler.mockImplementation(() => { messageBus.emit('state', { type: 'dirty' }); });

    subscribe(port);
    expect(() => fireState()).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('delivers again once the rows differ from what was last pushed', () => {
    const connections: Record<string, { text: string; kind: 'terminal' }[]> = {
      shell1: [{ text: 'zsh', kind: 'terminal' }],
    };
    const { handler, port } = makePort({ tabs: [pluginTab('shell1', 'shell-1')], connections });

    subscribe(port);
    fireState();
    connections.shell1 = [{ text: 'zsh', kind: 'terminal' }, { text: 'main.db', kind: 'terminal' }];
    fireState();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('delivers to a tab that took a label a closed tab had held', () => {
    const connections = { shell1: [{ text: 'zsh', kind: 'terminal' }] };
    const tabs: Tab[] = [pluginTab('shell1', 'shell-1')];
    const { handler, port } = makePort({ tabs, connections });

    subscribe(port);
    fireState();
    expect(handler).toHaveBeenCalledTimes(1);

    // The second shell tab in a session is `shell1` again once the first has gone, and its rows are
    // the same because the same terminal is on them. Under a map keyed by label that is the
    // fingerprint already on file, so this tab is never delivered at all and its connections window
    // says there are none for the whole life of the tab.
    tabs.length = 0;
    tabs.push(pluginTab('shell1', 'shell-2'));
    fireState();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ instanceKey: 'shell-2' }), expect.anything(),
    );
  });

  it('delivers again to a tab whose instance key returned after its own tab closed', () => {
    // The mirror of the case above, and the reason the memory is pruned rather than only re-keyed: a
    // plugin is free to reuse an instance key it has used before, and a fingerprint still on file for
    // that key would silence the tab exactly as a reused label did.
    const connections = { shell1: [{ text: 'zsh', kind: 'terminal' }] };
    const tabs: Tab[] = [pluginTab('shell1', 'shell-1')];
    const { handler, port } = makePort({ tabs, connections });

    subscribe(port);
    fireState();
    tabs.length = 0;
    fireState();
    tabs.push(pluginTab('shell9', 'shell-1'));
    fireState();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('delivers a slice the declaration did not name as empty rather than as its rows', () => {
    const { handler, port } = makePort({
      tabs: [pluginTab('shell1', 'shell-1')],
      slices: ['schedule'],
      connections: { shell1: [{ text: 'zsh', kind: 'terminal' }] },
      schedule: { shell1: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }] },
    });

    subscribe(port);
    fireState();

    // The slice list is the grant: a declaration that declined one is not quietly fed it.
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: [],
        schedule: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }],
      }),
      expect.anything(),
    );
  });

  it('skips a tab belonging to another plugin', () => {
    const { handler, port } = makePort({
      tabs: [{ label: 'image1', plugin: { id: 'image', instanceKey: '/a.png' } } as unknown as Tab],
    });

    subscribe(port);
    fireState();

    expect(handler).not.toHaveBeenCalled();
  });

  it('never calls a plugin that owns no tab', () => {
    const { handler, port } = makePort({ tabs: [] });

    subscribe(port);
    fireState();

    expect(handler).not.toHaveBeenCalled();
  });

  it('never calls a plugin that is not active', () => {
    const { handler, port, record } = makePort({ tabs: [pluginTab('shell1', 'shell-1')] });
    (record as { state: string }).state = 'declared';

    subscribe(port);
    fireState();

    expect(handler).not.toHaveBeenCalled();
  });

  it('disables the plugin alone when its handler fails', async () => {
    const { port } = makePort({ tabs: [pluginTab('shell1', 'shell-1')] });
    (port as { invoke: unknown }).invoke = () =>
      Promise.resolve({ status: 'failed' as const, error: new Error('handler broke') });

    subscribe(port);
    fireState();
    await Promise.resolve();
    await Promise.resolve();

    expect(port.disable).toHaveBeenCalledTimes(1);
  });
});