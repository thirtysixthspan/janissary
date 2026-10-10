import { describe, it, expect } from 'vitest';
import { changedSegments, changedSpans, type Span } from './intraline';
import type { DiffFile } from '@shared/plugins/diff/shared';

function hunk(lines: DiffFile['hunks'][number]['lines']): { lines: DiffFile['hunks'][number]['lines'] } {
  return { lines };
}

const removed = (text: string) => ({ kind: 'removed' as const, number: 1, jump: 1, text });
const added = (text: string) => ({ kind: 'added' as const, number: 1, jump: 1, text });
const context = (text: string) => ({ kind: 'context' as const, number: 1, jump: 1, text });

const spansOf = (text: string, spans: Span[]) =>
  changedSegments(text, spans).filter((segment) => segment.changed).map((segment) => segment.text);

describe('changedSpans', () => {
  it('answers the characters inside the pair that the alignment did not keep', () => {
    const lines = [removed('timeout = 30'), added('timeout = 60')];
    const spans = changedSpans(hunk(lines));
    expect(spansOf('timeout = 30', spans.get(lines[0]) ?? [])).toEqual(['3']);
    expect(spansOf('timeout = 60', spans.get(lines[1]) ?? [])).toEqual(['6']);
  });

  it('answers nothing for a line against itself', () => {
    const lines = [context('kept'), removed('same'), added('same')];
    const spans = changedSpans(hunk(lines));
    expect(spans.get(lines[1])).toEqual([]);
    expect(spans.get(lines[2])).toEqual([]);
  });

  it('answers nothing for a pair too unlike each other to align', () => {
    const lines = [removed('alpha beta gamma'), added('one two three four')];
    const spans = changedSpans(hunk(lines));
    expect(spansOf(lines[0].text, spans.get(lines[0]) ?? [])).toEqual([]);
    expect(spansOf(lines[1].text, spans.get(lines[1]) ?? [])).toEqual([]);
  });

  it('does not mark coincidental overlap between a long description and a short replacement', () => {
    const lines = [
      removed("Given an array, arr, containing only of the characters 'R' (red), 'W' (white), and 'B' (blue), sort the array in place so that the same colors are adjacent, with the colors in the order red, white, and blue."),
      added('subtracted long text'),
    ];
    const spans = changedSpans(hunk(lines));
    expect(spansOf(lines[0].text, spans.get(lines[0]) ?? [])).toEqual([]);
    expect(spansOf(lines[1].text, spans.get(lines[1]) ?? [])).toEqual([]);
  });

  it('marks a short parameter-name replacement after a shared declaration prefix', () => {
    const lines = [removed('@param {number} farm'), added('@param {number} test')];
    const spans = changedSpans(hunk(lines));
    expect(spansOf(lines[0].text, spans.get(lines[0]) ?? [])).toEqual(['farm']);
    expect(spansOf(lines[1].text, spans.get(lines[1]) ?? [])).toEqual(['test']);
  });

  it('answers nothing for a line past the alignment cap', () => {
    const long = 'x'.repeat(500);
    const lines = [removed(`${long}a`), added(`${long}b`)];
    const spans = changedSpans(hunk(lines));
    expect(spansOf(lines[0].text, spans.get(lines[0]) ?? [])).toEqual([]);
  });

  it('pairs a run of removed lines row by row with the run that replaced it', () => {
    const lines = [removed('a = 1'), removed('b = 2'), added('a = 2'), added('c = 3')];
    const spans = changedSpans(hunk(lines));
    expect(spansOf(lines[0].text, spans.get(lines[0]) ?? [])).toEqual(['1']);
    expect(spansOf(lines[1].text, spans.get(lines[1]) ?? [])).toEqual([]);
    expect(spansOf(lines[2].text, spans.get(lines[2]) ?? [])).toEqual(['2']);
    expect(spansOf(lines[3].text, spans.get(lines[3]) ?? [])).toEqual([]);
  });

  it('leaves an added line with no removed counterpart unmarked', () => {
    const lines = [context('kept'), added('brand new')];
    expect(spansOf(lines[1].text, changedSpans(hunk(lines)).get(lines[1]) ?? [])).toEqual([]);
  });
});
