import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import type { AcpSession, PromptHandlers } from '../acp/types.js';
import type { AcpSessionPool } from '../acp/session-pool.js';
import { VisualizationStore } from './store.js';
import { VisualizationsManager } from './manager.js';

let home = '';
let tabs: Tab[] = [];
// Every manager subscribes to the bus, and the bus is a module singleton, so one left undisposed
// would keep answering another test's `tab:removed`. They are collected here and released together.
let live: VisualizationsManager[] = [];

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janissary-viz-'));
  tabs = [];
  live = [];
});

afterEach(() => {
  for (const manager of live) manager.dispose();
  live = [];
  rmSync(home, { recursive: true, force: true });
  vi.useRealTimers();
});

function openTab(instanceKey: string): void {
  tabs.push({
    label: `visualizations-${instanceKey}`,
    view: 'plugin',
    plugin: { id: 'visualizations', instanceKey, schemaVersion: 2, payload: {}, fileRefs: [] },
  } as unknown as Tab);
}

function managers(): Managers {
  return { tab: { tabs, launchDir: home } } as unknown as Managers;
}

// The model is a stub the test answers, because what these cases are about is the host's side of the
// exchange: when it reads, when it refuses, and what it does with the reply it was given.
function fakePool() {
  const prompts: string[] = [];
  let handlers: PromptHandlers | undefined;
  const pool = {
    session: vi.fn(() => ({
      prompt: (text: string, given: PromptHandlers) => { prompts.push(text); handlers = given; },
      kill: vi.fn(),
    }) as AcpSession),
    close: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    pool: pool as unknown as AcpSessionPool,
    prompts,
    chunk: (text: string) => { handlers?.onChunk(text); },
    end: () => { handlers?.onEnd('end_turn'); },
  };
}

type Options = {
  read?: (source: string) => Promise<{ text: string } | { error: string }>;
  now?: () => number;
};

function build(options: Options = {}) {
  const stub = fakePool();
  const manager = new VisualizationsManager(managers(), {
    store: new VisualizationStore({ home }),
    pool: stub.pool,
    now: options.now,
    ...(options.read && { read: options.read }),
  });
  live.push(manager);
  return { manager, ...stub };
}

const CSV = 'region,revenue\nnorth,10\nsouth,4\n';
const reading = (text: string) => async () => ({ text });
const failing = (error: string) => async () => ({ error });

// The read is asynchronous and the view is not, so every test that needs the table waits for the
// promises it settled on to drain. Microtasks rather than a timer, because two of these tests run on
// faked timers where a timer would never fire.
async function settle(): Promise<void> {
  for (let index = 0; index < 14; index += 1) await Promise.resolve();
}

function windowOfId(manager: VisualizationsManager, id: string) {
  return manager.view().windows.find((window) => window.id === id);
}

describe('creating one', () => {
  it('opens a conversation with nothing in it, and no source', () => {
    const { manager } = build();
    openTab('v1');

    expect(manager.create('v1')).toBe(true);

    const view = windowOfId(manager, 'v1');
    expect(view?.source).toBe('');
    expect(view?.charts).toEqual([]);
    expect(view?.turns).toEqual([]);
  });

  // The whole of the property: an empty conversation is neither written nor listed, so opening one from
  // the index and walking away leaves nothing behind.
  it('leaves nothing on disk and nothing in the index until it has been started', () => {
    const { manager } = build();
    openTab('v1');
    manager.create('v1');
    expect(manager.view().summaries).toEqual([]);
    expect(() => new VisualizationStore({ home }).list()).not.toThrow();
    expect(new VisualizationStore({ home }).list()).toEqual([]);
  });

  it('sends the selection as the first message when the context menu supplies one', async () => {
    const { manager, prompts } = build({ read: reading(CSV) });
    openTab('v1');

    manager.create('v1', 'https://example.com/d.csv');
    await settle();

    expect(prompts).toHaveLength(1);
    expect(manager.view().windows[0]?.turns[0]?.query).toBe('https://example.com/d.csv');
  });

  it('refuses a second record for an id it already holds', () => {
    const { manager } = build();
    expect(manager.create('v1')).toBe(true);
    expect(manager.create('v1')).toBe(false);
  });
});

describe('sending a message', () => {
  it('reads a source the message named before it calls the model', async () => {
    const { manager, prompts } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv — plot revenue by region');
    await settle();

    expect(prompts[0]).toContain('- revenue (number)');
    expect(manager.view().windows[0]?.source).toBe('https://example.com/d.csv');
  });

  it('takes the most recent address, so pointing somewhere else is ordinary', async () => {
    const { manager } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/one.csv');
    await settle();
    manager.cancel('v1');
    manager.send('v1', 'actually https://example.com/two.csv');
    await settle();

    expect(manager.view().windows[0]?.source).toBe('https://example.com/two.csv');
  });

  // A refusal the host swallowed would leave the model reasoning about data that was never there, so
  // the reason is handed over rather than dropped.
  it('hands the model the reason an address was refused', async () => {
    const { manager, prompts } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', '/etc/hosts');
    await settle();

    expect(prompts[0]).toContain('/etc/hosts was refused');
    expect(manager.view().windows[0]?.source).toBe('');
  });

  it('says the user has not given a source yet when the first message has no address', async () => {
    const { manager, prompts } = build();
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'hello');
    await settle();

    expect(prompts[0]).toContain('have not given you a source yet');
  });

  it('records a read that failed, and keeps the source so it can be recovered', async () => {
    const { manager } = build({ read: failing('https://example.com/d.csv returned 500') });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv');
    await settle();
    manager.cancel('v1');

    const view = windowOfId(manager, 'v1');
    expect(view?.datasetsRead).toBeUndefined();
    expect(view?.source).toBe('https://example.com/d.csv');
    expect(JSON.stringify(view)).toContain('returned 500');
  });

  it('refuses a second message while one is in flight', () => {
    const { manager } = build();
    openTab('v1');
    manager.create('v1');
    expect(manager.send('v1', 'one')).toBe(true);
    expect(manager.send('v1', 'two')).toBe(false);
  });

  it('refuses a blank message', () => {
    const { manager } = build();
    openTab('v1');
    manager.create('v1');
    expect(manager.send('v1', ' '.repeat(3))).toBe(false);
  });
});

describe('a reply that draws', () => {
  it('stores the chart, and a second message changes it in place', async () => {
    const { manager, chunk, end } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv');
    await settle();
    chunk('{"say":"Here.","charts":[{"kind":"bar","x":"region","y":"revenue","title":"Revenue by region"}]}');
    end();

    const first = windowOfId(manager, 'v1')?.charts[0];
    expect(first?.title).toBe('Revenue by region');
    expect(windowOfId(manager, 'v1')?.title).toBe('Revenue by region');

    manager.send('v1', 'make it a line chart');
    await settle();
    chunk(`{"say":"Done.","charts":[{"id":"${first?.id ?? ''}","kind":"line","x":"region","y":"revenue","title":"Revenue by region"}]}`);
    end();

    const charts = windowOfId(manager, 'v1')?.charts ?? [];
    expect(charts).toHaveLength(1);
    expect(charts[0]?.kind).toBe('line');
  });

  it('holds a second chart beside the first', async () => {
    const { manager, chunk, end } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv');
    await settle();
    chunk('{"charts":[{"kind":"bar","x":"region","y":"revenue","title":"By region"}]}');
    end();
    manager.send('v1', 'also by nothing else');
    await settle();
    chunk('{"charts":[{"kind":"pie","x":"region","y":"revenue","title":"Share"}]}');
    end();

    expect(windowOfId(manager, 'v1')?.charts).toHaveLength(2);
  });

  it('names the visualization a rename asked for, and nothing else', async () => {
    const { manager, chunk, end } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv');
    await settle();
    chunk('{"name":"Regional revenue","charts":[{"kind":"bar","x":"region","y":"revenue","title":"Revenue by region"}]}');
    end();

    expect(windowOfId(manager, 'v1')?.title).toBe('Regional revenue');
  });
});

describe('live update', () => {
  async function charted(now?: () => number) {
    const built = build({ read: reading(CSV), ...(now && { now }) });
    openTab('v1');
    built.manager.create('v1');
    built.manager.send('v1', 'https://example.com/d.csv');
    await settle();
    built.chunk('{"charts":[{"kind":"bar","x":"region","y":"revenue","title":"Revenue by region"}]}');
    built.end();
    return built;
  }

  it('refuses an interval for a chart the record does not hold', async () => {
    const { manager } = await charted();
    expect(manager.setChartRefresh('v1', 'nope', 30)).toBe(false);
    expect(manager.setChartRefresh('nope', 'c1', 30)).toBe(false);
    expect(manager.setChartRefresh('v1', 'c1', -1)).toBe(false);
  });

  it('re-reads on the interval it was given, and a failed re-read keeps the chart', async () => {
    let reads = 0;
    let clock = 1000;
    const built = build({
      read: async () => { reads += 1; return reads > 1 ? { error: 'returned 500' } : { text: CSV }; },
      now: () => clock,
    });
    openTab('v1');
    built.manager.create('v1');
    built.manager.send('v1', 'https://example.com/d.csv');
    await settle();
    built.chunk('{"charts":[{"kind":"bar","x":"region","y":"revenue","title":"Revenue by region"}]}');
    built.end();
    const chartId = built.manager.view().windows[0]?.charts[0]?.id ?? '';

    vi.useFakeTimers();
    expect(built.manager.setChartRefresh('v1', chartId, 10)).toBe(true);
    clock += 11_000;
    vi.advanceTimersByTime(11_000);
    await settle();
    expect(reads).toBe(2);

    // A failed read must not leave the dataset due forever: the poll measures its next wait from when a
    // dataset was last *read*, so one more interval goes by without a third attempt. Otherwise the timer
    // re-arms at zero and hammers an endpoint that has already refused.
    clock += 1000;
    vi.advanceTimersByTime(1000);
    await settle();
    expect(reads).toBe(2);

    // A failed re-read must not take the chart off the screen.
    expect(built.manager.view().windows[0]?.charts).toHaveLength(1);
    vi.useRealTimers();
  });

  it('polls nothing for a record that was deleted while its tab is still open', async () => {
    let reads = 0;
    let clock = 1000;
    const built = build({ read: async () => { reads += 1; return { text: CSV }; }, now: () => clock });
    openTab('v1');
    built.manager.create('v1');
    built.manager.send('v1', 'https://example.com/d.csv');
    await settle();
    built.chunk('{"charts":[{"kind":"bar","x":"region","y":"revenue","title":"T"}]}');
    built.end();
    const chartId = built.manager.view().windows[0]?.charts[0]?.id ?? '';
    built.manager.setChartRefresh('v1', chartId, 10);
    built.manager.delete('v1');
    const before = reads;

    vi.useFakeTimers();
    clock += 60_000;
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(reads).toBe(before);
    vi.useRealTimers();
  });

  it('polls nothing while the interval is off', async () => {
    let reads = 0;
    const built = build({ read: async () => { reads += 1; return { text: CSV }; }, now: () => 1000 });
    openTab('v1');
    built.manager.create('v1');
    built.manager.send('v1', 'https://example.com/d.csv');
    await settle();
    built.chunk('{"charts":[{"kind":"bar","x":"region","y":"revenue","title":"T"}]}');
    built.end();
    const before = reads;

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(reads).toBe(before);
    vi.useRealTimers();
  });

  it('polls nothing at all once the tab closes', async () => {
    let reads = 0;
    const built = build({ read: async () => { reads += 1; return { text: CSV }; }, now: () => 1000 });
    openTab('v1');
    built.manager.create('v1');
    built.manager.send('v1', 'https://example.com/d.csv');
    await settle();
    built.chunk('{"charts":[{"kind":"bar","x":"region","y":"revenue","title":"T"}]}');
    built.end();
    built.manager.setChartRefresh('v1', built.manager.view().windows[0]?.charts[0]?.id ?? '', 10);
    const before = reads;

    tabs.length = 0;
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'visualizations-v1' });
    await settle();
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(reads).toBe(before);
    vi.useRealTimers();
  });

  it('re-asks the agent for a file it acquired rather than reading anything', async () => {
    const built = build({ read: reading(CSV), now: () => 1000 });
    openTab('v1');
    // The model says it wrote the file, so the file has to be there: the host reads what the agent
    // wrote rather than asking it to write it again.
    const workspace = new VisualizationStore({ home }).ensure('v1');
    writeFileSync(path.join(workspace, 'data.json'), CSV);
    built.manager.create('v1');
    built.manager.send('v1', 'https://example.com/d.csv');
    await settle();
    built.chunk('{"charts":[{"data":{"kind":"file","path":"data.json"},"kind":"bar","x":"region","y":"revenue","title":"T"}]}');
    built.end();
    const before = built.prompts.length;

    expect(built.manager.refreshChart('v1', built.manager.view().windows[0]?.charts[0]?.id ?? '')).toBe(true);
    await settle();

    expect(built.prompts.length).toBe(before + 1);
    expect(built.prompts[before]).toContain('Fetch it again');
  });
});

describe('deleting one', () => {
  it('keeps an open tab inert and says so, and releases it when the tab closes', async () => {
    const { manager } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv');
    await settle();

    manager.delete('v1');

    expect(windowOfId(manager, 'v1')?.deleted).toBe(true);
    expect(manager.send('v1', 'anything')).toBe(false);

    tabs.length = 0;
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'visualizations-v1' });
    await settle();
    expect(windowOfId(manager, 'v1')).toBeUndefined();
  });
});

describe('what it refuses', () => {
  it('refuses every action for a record it does not hold', async () => {
    const { manager } = build();
    expect(manager.load('nope')).toBe(false);
    expect(manager.send('nope', 'hello')).toBe(false);
    expect(manager.setChartRefresh('nope', 'c', 10)).toBe(false);
    expect(manager.refreshChart('nope', 'c')).toBe(false);
    expect(manager.cancel('nope')).toBe(false);
  });

  it('disposes without removing anything from disk', async () => {
    const { manager } = build({ read: reading(CSV) });
    openTab('v1');
    manager.create('v1');
    manager.send('v1', 'https://example.com/d.csv');
    await settle();

    manager.dispose();

    expect(new VisualizationStore({ home }).list()).toHaveLength(1);
  });
});
