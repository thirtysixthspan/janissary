import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureCopiedText } from '../../shared/clipboard-captures';
import { createClipboardHistoryStore, type ClipboardHistoryStore } from './store';

// The history is the plugin's own: ordering, dedupe, and the cap all live here rather than in the host,
// so a user who never opens the popup pays nothing for them.

let store: ClipboardHistoryStore;

const texts = () => store.getRows().map((row) => row.text);

beforeEach(() => {
  store = createClipboardHistoryStore();
});

afterEach(() => {
  store.dispose();
});

describe('the clipboard history', () => {
  it('orders the newest copy at the bottom', () => {
    store.record('first');
    store.record('second');
    expect(texts()).toEqual(['first', 'second']);
  });

  it('moves a re-copied entry to the bottom rather than adding a second row', () => {
    store.record('first');
    store.record('second');
    store.record('first');
    expect(texts()).toEqual(['second', 'first']);
  });

  it('ignores a copy that is empty or only whitespace', () => {
    store.record('');
    store.record('   \n\t\n');
    expect(texts()).toEqual([]);
  });

  it('keeps the configured number of entries and drops the oldest', () => {
    store.applyMaxEntries(() => 3);
    for (const text of ['a', 'b', 'c', 'd']) store.record(text);
    expect(texts()).toEqual(['b', 'c', 'd']);
  });

  it('starts each test from the default cap, whatever the last one left behind', () => {
    store.applyMaxEntries(() => 3);
    store.dispose();
    const twenty = Array.from({ length: 20 }, (_unused, index) => `t${index}`);
    for (const text of twenty) store.record(text);
    expect(store.getRows()).toHaveLength(15);
  });

  it('trims at once when the cap is lowered below what is already held', () => {
    for (const text of ['a', 'b', 'c', 'd']) store.record(text);
    store.applyMaxEntries(() => 2);
    expect(texts()).toEqual(['c', 'd']);
  });

  it('falls back to 15 for a cap that is not a positive integer', () => {
    store.applyMaxEntries(() => 100);
    const twenty = Array.from({ length: 20 }, (_unused, index) => `t${index}`);
    for (const text of twenty) store.record(text);
    store.applyMaxEntries(() => 0);
    expect(store.getRows()).toHaveLength(15);
    store.applyMaxEntries(() => -1);
    expect(store.getRows()).toHaveLength(15);
    store.applyMaxEntries(() => 2.5);
    expect(store.getRows()).toHaveLength(15);
  });

  // The plugin starts at launch and the configured cap arrives in the first state snapshot after it, so
  // the store reads its source again rather than keeping the number it was started with.
  it('keeps more entries once a higher cap arrives after start', () => {
    let configured = 15;
    store.applyMaxEntries(() => configured);
    configured = 20;
    const twenty = Array.from({ length: 20 }, (_unused, index) => `t${index}`);
    for (const text of twenty) store.record(text);
    expect(store.getRows()).toHaveLength(20);
  });

  it('trims on the next open once a lower cap arrives after the copies', () => {
    let configured = 15;
    store.applyMaxEntries(() => configured);
    for (const text of ['a', 'b', 'c', 'd']) store.record(text);
    configured = 2;
    store.selectNewest();
    expect(texts()).toEqual(['c', 'd']);
    expect(store.getSelection()).toBe(1);
  });

  it('clamps the selection to the rows that exist', () => {
    store.record('only');
    store.setSelection(5);
    expect(store.getSelection()).toBe(0);
    store.setSelection(-3);
    expect(store.getSelection()).toBe(0);
  });

  it('selects the newest row on open, and no row when there is nothing', () => {
    store.record('first');
    store.record('second');
    store.setSelection(0);
    store.selectNewest();
    expect(store.getSelection()).toBe(1);
    store.dispose();
    store.selectNewest();
    expect(store.getSelection()).toBe(0);
  });

  it('keeps a row the same entry when the list changes around it', () => {
    store.record('first');
    const before = store.getRows()[0]?.id;
    store.record('second');
    expect(store.getRows()[0]?.id).toBe(before);
    expect(store.getRows()[1]?.id).not.toBe(before);
  });

  it('reuses the row snapshot until the store changes', () => {
    const first = store.getRows();
    expect(store.getRows()).toBe(first);
    store.record('one');
    expect(store.getRows()).not.toBe(first);
  });

  it('reads the full text at a row, which is not the label', () => {
    store.record('  spaced\nsecond line');
    expect(store.getTextAt(0)).toBe('  spaced\nsecond line');
    expect(store.getRows()[0]?.label).toBe('spaced');
    expect(store.getRows()[0]?.postfix).toBe('(2 lines)');
  });

  it('records what the application copies while started, and stops when disposed', () => {
    // `start` is what subscribes to the capture seam, which is why the plugin is declared to
    // activate at launch: a copy made before it starts is never seen.
    captureCopiedText('before start');
    store.start(() => 15);
    captureCopiedText('after start');
    expect(texts()).toEqual(['after start']);

    store.dispose();
    captureCopiedText('after dispose');
    expect(texts()).toEqual([]);
  });

  it('keeps history and capture subscriptions independent across store instances', () => {
    const second = createClipboardHistoryStore();
    store.start(() => 15);
    second.start(() => 15);
    captureCopiedText('before first dispose');
    expect(texts()).toEqual(['before first dispose']);
    expect(second.getRows().map((row) => row.text)).toEqual(['before first dispose']);

    store.dispose();
    captureCopiedText('after first dispose');

    expect(texts()).toEqual([]);
    expect(second.getRows().map((row) => row.text)).toEqual(['before first dispose', 'after first dispose']);
    second.dispose();
  });

  it('starts its injected capture subscription once and disposes it idempotently', () => {
    let onCopy: ((text: string) => void) | undefined;
    const unsubscribe = vi.fn();
    const injected = createClipboardHistoryStore((listener) => {
      onCopy = listener;
      return unsubscribe;
    });
    injected.start(() => 4);
    injected.start(() => 4);
    onCopy?.('captured');
    expect(injected.getRows().map((row) => row.text)).toEqual(['captured']);

    injected.dispose();
    injected.dispose();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(injected.getRows()).toEqual([]);
  });
});
