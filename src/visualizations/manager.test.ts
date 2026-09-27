import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
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
    label: 'visualizations-1',
    view: 'plugin',
    plugin: { id: 'visualizations', instanceKey, schemaVersion: 1, payload: {}, fileRefs: [] },
  } as unknown as Tab);
}

function managers(): Managers {
  return { tab: { tabs } } as unknown as Managers;
}

type Options = { read?: (source: string) => Promise<{ text: string } | { error: string }>; now?: () => number };

function build(options: Options = {}) {
  const manager = new VisualizationsManager(managers(), {
    store: new VisualizationStore({ home }),
    now: options.now,
    ...(options.read && { read: options.read }),
  });
  live.push(manager);
  return manager;
}

const CSV = 'region,revenue\nnorth,10\nsouth,4\n';

const reading = (text: string) => async () => ({ text });
const failing = (error: string) => async () => ({ error });

// The read is asynchronous and the view is not, so every test that needs the table waits for the
// promises it settled on to drain. Microtasks rather than a timer, because two of these tests run on
// faked timers where a timer would never fire.
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function windowOfId(manager: VisualizationsManager, id: string) {
  return manager.view().windows.find((window) => window.id === id);
}

describe('VisualizationsManager', () => {
  it('creates a record, reads its source, and starts the interview on the table it found', async () => {
    const manager = build({ read: reading(CSV) });
    openTab('one');

    expect(manager.create('one', 'https://example.com/d.csv')).toBe(true);
    await settle();

    const [window] = manager.view().windows;
    expect(window).toMatchObject({ id: 'one', title: 'New visualization' });
    expect(window?.table).toMatchObject({ total: 2, truncated: false });
    expect(window?.error).toBeUndefined();
  });

  it('refuses a duplicate id, and a source it cannot classify', () => {
    const manager = build();
    expect(manager.create('one', 'https://example.com/d.csv')).toBe(true);
    expect(manager.create('one', 'https://example.com/other.csv')).toBe(false);
    expect(manager.create('two', 'javascript:alert(1)')).toBe(false);
  });

  it('records a read that failed, and keeps the source editable so it can be recovered', async () => {
    const manager = build({ read: failing('https://example.com/d.csv returned 404') });
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    await settle();

    expect(manager.view().windows[0]?.error).toBe('https://example.com/d.csv returned 404');

    manager.setSource('one', 'https://example.com/other.csv');
    expect(manager.view().windows[0]?.error).toBeUndefined();
    expect(manager.view().windows[0]?.source).toBe('https://example.com/other.csv');
  });

  it('records a source it cannot parse, and one that cannot be charted', async () => {
    const unreadable = build({ read: reading('{"a":1}') });
    openTab('one');
    unreadable.create('one', 'https://example.com/d.json');
    await settle();
    expect(unreadable.view().windows[0]?.error)
      .toBe('expected an array of objects, or an object holding one');

    const unchartable = build({ read: reading('name\nnorth\nsouth\n') });
    openTab('two');
    unchartable.create('two', 'https://example.com/names.csv');
    await settle();
    expect(windowOfId(unchartable, 'two')?.error).toBe('the source has no numeric column to measure');
  });

  it('builds a window only for a visualization that has an open tab', async () => {
    const manager = build({ read: reading(CSV) });
    manager.create('one', 'https://example.com/d.csv');
    await settle();
    expect(manager.view().windows).toEqual([]);

    openTab('one');
    expect(manager.view().windows.map((window) => window.id)).toEqual(['one']);
  });

  it('offers every catalogued model pair, and refuses a pair that is not catalogued', () => {
    const manager = build();
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    const pair = manager.view().models[0];
    expect(pair).toBeDefined();
    if (!pair) return;

    expect(manager.setModel('one', { harness: 'claude', model: 'not-a-catalogued-model' })).toBe(false);
    expect(manager.setModel('one', pair)).toBe(true);
    expect(manager.view().windows[0]?.pair).toEqual(pair);
  });

  it('refuses a source change once a chart exists, because every answer was about the old data', async () => {
    const first = build({ read: reading(CSV) });
    openTab('one');
    first.create('one', 'https://example.com/d.csv');
    await settle();
    const store = new VisualizationStore({ home });
    const stored = store.read('one');
    expect(stored).toBeDefined();
    if (!stored) return;
    store.write({ ...stored, chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });
    first.dispose();

    // A fresh manager, so the refusal is proven against what is on disk rather than against a record
    // the first manager is still holding in memory.
    const reopened = build();
    expect(reopened.setSource('one', 'https://example.com/other.csv')).toBe(false);
  });

  it('renames a trimmed and capped name, and refuses a blank one', () => {
    const manager = build();
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');

    expect(manager.rename('one', '  Quarterly revenue  ')).toBe(true);
    expect(manager.view().windows[0]?.title).toBe('Quarterly revenue');
    expect(manager.rename('one', 'x'.repeat(80))).toBe(true);
    expect(manager.view().windows[0]?.title).toHaveLength(60);
    expect(manager.rename('one', ' '.repeat(3))).toBe(false);
  });

  it('refuses every action for a record it does not hold', () => {
    const manager = build();
    expect(manager.rename('nope', 'T')).toBe(false);
    expect(manager.setModel('nope', { harness: 'opencode', model: 'm' })).toBe(false);
    expect(manager.setRefresh('nope', 10)).toBe(false);
    expect(manager.refreshNow('nope')).toBe(false);
    expect(manager.revise('nope', 'q')).toBe(false);
    expect(manager.startInterview('nope')).toBe(false);
    expect(manager.answer('nope', 'q1', 'yes')).toBe(false);
  });

  it('refuses a source change once a chart exists, because every answer was about the old data', async () => {
    const first = build({ read: reading(CSV) });
    openTab('one');
    first.create('one', 'https://example.com/d.csv');
    await settle();
    const store = new VisualizationStore({ home });
    const stored = store.read('one');
    expect(stored).toBeDefined();
    if (!stored) return;
    store.write({ ...stored, chart: { kind: 'bar', x: 'region', y: 'revenue', title: 'T' } });
    first.dispose();

    // A fresh manager, so the refusal is proven against what is on disk rather than against a record
    // the first manager is still holding in memory.
    const reopened = build();
    expect(reopened.setSource('one', 'https://example.com/other.csv')).toBe(false);
  });

  it('re-reads on the interval it was given, and a failed re-read keeps the table on screen', async () => {
    vi.useFakeTimers();
    let clock = 1_000_000;
    let answer: { text: string } | { error: string } = { text: CSV };
    const read = vi.fn().mockImplementation(async () => answer);
    const manager = build({ read, now: () => clock });
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    await settle();
    expect(read).toHaveBeenCalledTimes(1);

    expect(manager.setRefresh('one', 10)).toBe(true);
    clock += 10_000;
    answer = { text: 'region,revenue\nnorth,99\n' };
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(windowOfId(manager, 'one')?.table?.rows).toEqual([['north', 99]]);

    clock += 10_000;
    answer = { error: 'https://example.com/d.csv returned 500' };
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    const window = windowOfId(manager, 'one');
    expect(window?.error).toBe('https://example.com/d.csv returned 500');
    expect(window?.table?.rows).toEqual([['north', 99]]);
  });

  it('polls nothing while the interval is off, and nothing at all once the tab closes', async () => {
    vi.useFakeTimers();
    let clock = 1_000_000;
    const read = vi.fn().mockImplementation(async () => ({ text: CSV }));
    const manager = build({ read, now: () => clock });
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    await settle();

    // The interval is off, so no poll is ever armed and the clock can run for an hour without a read.
    clock += 3_600_000;
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(read).toHaveBeenCalledTimes(1);

    // Arming one and then closing the tab leaves nothing pending: the open set is read off the tabs,
    // so a visualization nobody is looking at is not polled behind their back.
    manager.setRefresh('one', 10);
    tabs.length = 0;
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'visualizations-1' });
    await new Promise((resolve) => { queueMicrotask(resolve); });
    clock += 60_000;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not let two reads of one source overlap', async () => {
    let release = (): void => {};
    const read = vi.fn().mockImplementation(() => new Promise<{ text: string }>((resolve) => {
      release = () => { resolve({ text: CSV }); };
    }));
    const manager = build({ read });
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    manager.refreshNow('one');
    manager.refreshNow('one');
    expect(read).toHaveBeenCalledTimes(1);
    release();
    await settle();
  });

  it('marks a deleted record for a tab that was open, and keeps the record gone', async () => {
    const manager = build({ read: reading(CSV) });
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    await settle();

    manager.delete('one');

    const window = manager.view().windows[0];
    expect(window?.deleted).toBe(true);
    expect(manager.view().summaries).toEqual([]);
    expect(new VisualizationStore({ home }).read('one')).toBeUndefined();
  });

  it('disposes without removing anything from disk', async () => {
    const manager = build({ read: reading(CSV) });
    openTab('one');
    manager.create('one', 'https://example.com/d.csv');
    await settle();

    manager.dispose();

    expect(new VisualizationStore({ home }).read('one')).toMatchObject({ id: 'one' });
  });
});
