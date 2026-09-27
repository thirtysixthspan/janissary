import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
  type VisualizationsView,
} from '../api.js';
import { activate } from './activate.js';
import type { VisualizationWindow } from './shared.js';

function windowOf(over: Partial<VisualizationWindow> = {}): VisualizationWindow {
  return {
    id: 'one',
    title: 'Revenue',
    source: 'https://example.com/d.csv',
    pair: { harness: 'opencode', model: 'model' },
    charts: [],
    turns: [],
    ...over,
  };
}

function viewOf(over: Partial<VisualizationsView> = {}): VisualizationsView {
  return {
    summaries: [{ id: 'one', title: 'Revenue', updatedAt: 10 }],
    windows: [windowOf()],
    models: [{ harness: 'opencode', model: 'model' }],
    ...over,
  };
}

function fixture(data: VisualizationsView = viewOf()) {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const docks: { key: string; dock: 'left' | 'right' | null }[] = [];
  const actions: TabPluginTopicAction[] = [];
  // The host is the one that mints the id and answers with the record it created, so the fake topic
  // grows a window for a `create` exactly as a real one would. Without that the plugin's own check —
  // that a record it just created has a window — would have nothing to find.
  const topicAction = (action: TabPluginTopicAction) => {
    actions.push(action);
    if (action.topic === 'visualizations' && action.action === 'create') {
      data.windows.push(windowOf({ id: action.id, title: 'New visualization', source: '' }));
    }
  };
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
    topicData: () => data,
    topicAction,
    configuredViewer: () => '',
    openExternally: () => false,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason) },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)) },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, docks, opened, updated };
}

function intent(
  name: string,
  payload: unknown,
  tabPayload: unknown,
  data: VisualizationsView = viewOf(),
) {
  const fake = fixture(data);
  const result = activate().intent({ tab: 'visualizations-1', intent: name, payload, tabPayload }, fake.capabilities);
  return { ...fake, result };
}

const LIST = { kind: 'list', entries: [] };
const TAB = { kind: 'visualization', window: windowOf(), models: [] };

describe('visualizations command', () => {
  it('opens the singleton index titled with the topic name', () => {
    const fake = fixture();
    activate().command?.('', fake.capabilities);
    expect(fake.opened).toHaveLength(1);
    expect(fake.opened[0].key).toBe('visualizations');
    expect(fake.opened[0].value.title).toBe('visualizations');
  });

  it('docks into the named sidebar, and undocks back to centre when bare', () => {
    const left = fixture();
    activate().command?.('left', left.capabilities);
    expect(left.docks).toEqual([{ key: 'visualizations', dock: 'left' }]);

    const right = fixture();
    activate().command?.('right', right.capabilities);
    expect(right.docks).toEqual([{ key: 'visualizations', dock: 'right' }]);

    const bare = fixture();
    activate().command?.('', bare.capabilities);
    expect(bare.docks).toEqual([{ key: 'visualizations', dock: null }]);
  });

  it('opens a visualization by title, ignoring case', () => {
    const fake = fixture();
    activate().command?.('revenue', fake.capabilities);
    expect(fake.actions).toEqual([{ topic: 'visualizations', action: 'load', id: 'one' }]);
    expect(fake.opened[0]?.key).toBe('one');
  });

  it('reports a title that matches nothing', () => {
    const fake = fixture();
    expect(() => activate().command?.('nothing', fake.capabilities))
      .toThrow('No visualization matching "nothing".');
  });

  it('refuses to open a file, because it claims none', () => {
    const fake = fixture();
    expect(() => activate().opener.inline('/tmp/rows.csv', fake.capabilities))
      .toThrow('visualizations opens no files');
  });
});

describe('Visualize this', () => {
  // The selection is the opening message rather than a field the tab has to offer, so a user who selected
  // an address anywhere in the application lands in a tab that has already been sent it.
  it('creates a visualization whose first message is the selection, verbatim', () => {
    const fake = fixture();
    activate().defaultMenuAction?.('https://example.com/d.csv', fake.capabilities);
    const created = fake.actions.find((action) => action.action === 'create');
    expect(created).toMatchObject({ topic: 'visualizations', message: 'https://example.com/d.csv' });
    expect(fake.opened).toHaveLength(1);
  });

  // A selection that is not an address is answered by the host refusing to read it, and this is where
  // that refusal happens — the plugin passes the text through without inspecting it.
  it('passes a selection that is not a source straight through', () => {
    const fake = fixture();
    activate().defaultMenuAction?.('just some text', fake.capabilities);
    expect(fake.actions[0]).toMatchObject({ message: 'just some text' });
  });
});

describe('visualizations notifications', () => {
  it('repaints the index with its payload alone, and a record tab with its title and payload', () => {
    const fake = fixture();
    activate().notify?.(
      { topic: 'visualizations', data: viewOf(), tabs: ['visualizations', 'one'] },
      fake.capabilities,
    );
    expect(fake.updated.map((entry) => entry.key)).toEqual(['visualizations', 'one']);
    expect(fake.updated[0]?.value.title).toBeUndefined();
    expect(fake.updated[1]?.value.title).toBe('Revenue');
  });

  it('ignores another topic, and an unreadable slice', () => {
    const fake = fixture();
    activate().notify?.({ topic: 'schedules', data: [], tabs: ['one'] }, fake.capabilities);
    activate().notify?.(
      { topic: 'visualizations', data: { nope: true }, tabs: ['one'] } as never,
      fake.capabilities,
    );
    expect(fake.updated).toEqual([]);
  });

  it('skips an instance key with no window in the slice', () => {
    const fake = fixture();
    activate().notify?.(
      { topic: 'visualizations', data: viewOf(), tabs: ['one', 'gone'] },
      fake.capabilities,
    );
    expect(fake.updated.map((entry) => entry.key)).toEqual(['one']);
  });
});

describe('visualizations list intents', () => {
  it('creates an empty one, opens by id, and deletes by id', () => {
    expect(intent('create', {}, LIST).actions)
      .toContainEqual({ topic: 'visualizations', action: 'create', id: expect.any(String) });
    expect(intent('create', { message: 'https://example.com/d.csv' }, LIST).actions)
      .toContainEqual({ topic: 'visualizations', action: 'create', id: expect.any(String), message: 'https://example.com/d.csv' });
    expect(intent('open', { id: 'one' }, LIST).actions)
      .toEqual([{ topic: 'visualizations', action: 'load', id: 'one' }]);
    expect(intent('delete', { id: 'one' }, LIST).actions)
      .toEqual([{ topic: 'visualizations', action: 'delete', id: 'one' }]);
  });

  it('returns null rather than falling off the end, which would disable the plugin', () => {
    expect(intent('open', { id: 'one' }, LIST).result).toBeNull();
  });

  it('rejects a malformed payload without disabling the plugin', () => {
    expect(() => intent('create', { message: '  ' }, LIST)).toThrow('invalid create payload');
    expect(() => intent('open', { id: '' }, LIST)).toThrow('invalid open payload');
    expect(() => intent('delete', {}, LIST)).toThrow('invalid delete payload');
  });

  it('refuses a list intent sent to a record tab', () => {
    expect(() => intent('open', { id: 'one' }, TAB)).toThrow('invalid open payload');
  });
});

describe('visualizations record intents', () => {
  const cases: [string, unknown, Record<string, unknown>][] = [
    ['cancel', {}, { action: 'cancel' }],
    ['send', { query: 'make it a line' }, { action: 'send', query: 'make it a line' }],
    ['set-chart-refresh', { chartId: 'c1', seconds: 30 }, { action: 'setChartRefresh', chartId: 'c1', seconds: 30 }],
    ['refresh-chart', { chartId: 'c1' }, { action: 'refreshChart', chartId: 'c1' }],
  ];

  for (const [name, payload, expected] of cases) {
    it(`maps ${name} to its topic action`, () => {
      const fake = intent(name, payload, TAB);
      expect(fake.actions).toEqual([{ topic: 'visualizations', id: 'one', ...expected }]);
      expect(fake.result).toBeNull();
    });
  }

  it('rejects a payload the named intent does not accept', () => {
    expect(() => intent('cancel', { extra: 1 }, TAB)).toThrow('invalid cancel payload');
    expect(() => intent('send', { query: '  ' }, TAB)).toThrow('invalid send payload');
    expect(() => intent('set-chart-refresh', { chartId: 'c1', seconds: -1 }, TAB)).toThrow('invalid set-chart-refresh payload');
    expect(() => intent('set-chart-refresh', { seconds: 30 }, TAB)).toThrow('invalid set-chart-refresh payload');
    expect(() => intent('refresh-chart', { chartId: '' }, TAB)).toThrow('invalid refresh-chart payload');
  });

  it('rejects an intent it does not declare, including one every object carries', () => {
    expect(() => intent('nope', {}, TAB)).toThrow('unknown visualizations intent "nope"');
    expect(() => intent('toString', {}, TAB)).toThrow('unknown visualizations intent "toString"');
  });

  it('refuses a record intent sent to the index tab', () => {
    expect(() => intent('cancel', {}, LIST)).toThrow('invalid cancel payload');
  });

  it('reports a failure on a tab payload its own guard rejects, which is the host record', () => {
    expect(() => intent('cancel', {}, { kind: 'visualization', window: { id: 'one' } }))
      .toThrow('invalid visualizations tab payload');
  });
});
