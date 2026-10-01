import { beforeEach, describe, expect, it } from 'vitest';
import { captureCopiedText } from '../../shared/clipboard-captures';
import {
  applyMaxEntries, disposeHistory, record, rows, selectNewest, selection, setSelection, startHistory, textAt,
} from './store';

// The history is the plugin's own: ordering, dedupe, and the cap all live here rather than in the host,
// so a user who never opens the popup pays nothing for them.

const texts = () => rows().map((row) => row.text);

beforeEach(() => {
  disposeHistory();
});

describe('the clipboard history', () => {
  it('orders the newest copy at the bottom', () => {
    record('first');
    record('second');
    expect(texts()).toEqual(['first', 'second']);
  });

  it('moves a re-copied entry to the bottom rather than adding a second row', () => {
    record('first');
    record('second');
    record('first');
    expect(texts()).toEqual(['second', 'first']);
  });

  it('ignores a copy that is empty or only whitespace', () => {
    record('');
    record('   \n\t\n');
    expect(texts()).toEqual([]);
  });

  it('keeps the configured number of entries and drops the oldest', () => {
    applyMaxEntries(3);
    for (const text of ['a', 'b', 'c', 'd']) record(text);
    expect(texts()).toEqual(['b', 'c', 'd']);
  });

  it('starts each test from the default cap, whatever the last one left behind', () => {
    applyMaxEntries(15);
    expect(rows().length).toBeLessThanOrEqual(15);
  });

  it('trims at once when the cap is lowered below what is already held', () => {
    for (const text of ['a', 'b', 'c', 'd']) record(text);
    applyMaxEntries(2);
    expect(texts()).toEqual(['c', 'd']);
  });

  it('falls back to 15 for a cap that is not a positive integer', () => {
    applyMaxEntries(100);
    const twenty = Array.from({ length: 20 }, (_unused, index) => `t${index}`);
    for (const text of twenty) record(text);
    applyMaxEntries(0);
    expect(rows()).toHaveLength(15);
    applyMaxEntries(-1);
    expect(rows()).toHaveLength(15);
    applyMaxEntries(2.5);
    expect(rows()).toHaveLength(15);
  });

  it('clamps the selection to the rows that exist', () => {
    record('only');
    setSelection(5);
    expect(selection()).toBe(0);
    setSelection(-3);
    expect(selection()).toBe(0);
  });

  it('selects the newest row on open, and no row when there is nothing', () => {
    record('first');
    record('second');
    setSelection(0);
    selectNewest();
    expect(selection()).toBe(1);
    disposeHistory();
    selectNewest();
    expect(selection()).toBe(0);
  });

  it('keeps a row the same entry when the list changes around it', () => {
    record('first');
    const before = rows()[0]?.id;
    record('second');
    expect(rows()[0]?.id).toBe(before);
    expect(rows()[1]?.id).not.toBe(before);
  });

  it('reads the full text at a row, which is not the label', () => {
    record('  spaced\nsecond line');
    expect(textAt(0)).toBe('  spaced\nsecond line');
    expect(rows()[0]?.label).toBe('spaced');
    expect(rows()[0]?.postfix).toBe('(2 lines)');
  });

  it('records what the application copies while started, and stops when disposed', () => {
    // `startHistory` is what subscribes to the capture seam, so the history begins at the first open
    // of the popup rather than at application start — the module is not even loaded before then.
    captureCopiedText('before start');
    startHistory(15);
    captureCopiedText('after start');
    expect(texts()).toEqual(['after start']);

    disposeHistory();
    captureCopiedText('after dispose');
    expect(texts()).toEqual([]);
  });
});
