import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PDF_FIND_CURRENT, PDF_FIND_MATCH, occurrencesInLayer, paintMarks,
} from './pdf-find-marks';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function layerWith(...lines: Array<string | string[]>): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'pdf-text-layer';
  for (const line of lines) {
    const parts = Array.isArray(line) ? line : [line];
    for (const part of parts) {
      const span = document.createElement('span');
      span.textContent = part;
      layer.append(span);
    }
    layer.append(document.createElement('br'));
  }
  return layer;
}

function stubHighlights(): Map<string, Set<Range>> {
  const highlights = new Map<string, Set<Range>>();
  vi.stubGlobal('CSS', { highlights });
  vi.stubGlobal('Highlight', class extends Set<Range> {});
  return highlights;
}

function texts(occurrences: ReturnType<typeof occurrencesInLayer>): string[] {
  return occurrences.map((occurrence) => occurrence.range.toString());
}

describe('occurrencesInLayer', () => {
  it('matches case-insensitively', () => {
    const layer = layerWith('Alpha Beta');

    expect(texts(occurrencesInLayer(layer, 'ALPHA'))).toEqual(['Alpha']);
  });

  it('returns one range across two spans on the same line', () => {
    const layer = layerWith(['Al', 'pha']);
    const [occurrence] = occurrencesInLayer(layer, 'alph');
    const spans = layer.querySelectorAll('span');

    expect(occurrence?.range.toString()).toBe('Alph');
    expect(occurrence?.range.startContainer).toBe(spans[0]?.firstChild);
    expect(occurrence?.range.startOffset).toBe(0);
    expect(occurrence?.range.endContainer).toBe(spans[1]?.firstChild);
    expect(occurrence?.range.endOffset).toBe(2);
  });

  it('reads text and line breaks nested inside wrappers', () => {
    const layer = document.createElement('div');
    const wrapper = document.createElement('span');
    const text = document.createElement('span');
    text.textContent = 'nested';
    wrapper.append(text, document.createElement('br'));
    layer.append(wrapper);

    expect(texts(occurrencesInLayer(layer, 'nested'))).toEqual(['nested']);
  });

  it('finds nothing across a line break', () => {
    expect(occurrencesInLayer(layerWith('ab', 'cd'), 'bc')).toEqual([]);
  });

  it('tags each occurrence with its line index', () => {
    const layer = layerWith('alpha', 'beta');

    expect(occurrencesInLayer(layer, 'beta')[0]?.line).toBe(1);
  });

  it('keeps an empty line between consecutive breaks in the indexes', () => {
    const layer = layerWith('alpha', [], 'beta');

    expect(occurrencesInLayer(layer, 'beta')[0]?.line).toBe(2);
  });

  it('reports start relative to the line, not the layer', () => {
    const layer = layerWith('alpha', 'beta');

    expect(occurrencesInLayer(layer, 'beta')[0]?.start).toBe(0);
  });

  it('ends a match at the last character of a line without reaching into the next', () => {
    const layer = layerWith(['a', 'b'], 'cd');
    const [occurrence] = occurrencesInLayer(layer, 'ab');
    const second = layer.querySelectorAll('span')[1]?.firstChild;

    expect(occurrence?.range.toString()).toBe('ab');
    expect(occurrence?.range.endContainer).toBe(second);
    expect(occurrence?.range.endOffset).toBe(1);
  });

  it('ends the last line without a trailing break', () => {
    const layer = document.createElement('div');
    const first = document.createElement('span');
    first.textContent = 'alpha';
    const second = document.createElement('span');
    second.textContent = 'beta';
    layer.append(first, document.createElement('br'), second);

    const [occurrence] = occurrencesInLayer(layer, 'beta');

    expect(occurrence?.line).toBe(1);
    expect(occurrence?.start).toBe(0);
    expect(occurrence?.range.toString()).toBe('beta');
  });

  it('treats a text node boundary as the next node at the start and the same node at the end', () => {
    const layer = layerWith(['ab', 'cd']);
    const spans = layer.querySelectorAll('span');
    const firstNode = spans[0]?.firstChild;
    const secondNode = spans[1]?.firstChild;
    const [ab] = occurrencesInLayer(layer, 'ab');
    const [cd] = occurrencesInLayer(layer, 'cd');

    expect(ab?.range.startContainer).toBe(firstNode);
    expect(ab?.range.startOffset).toBe(0);
    expect(ab?.range.endContainer).toBe(firstNode);
    expect(ab?.range.endOffset).toBe(2);
    expect(cd?.range.startContainer).toBe(secondNode);
    expect(cd?.range.startOffset).toBe(0);
    expect(cd?.range.endContainer).toBe(secondNode);
    expect(cd?.range.endOffset).toBe(2);
  });

  it('returns every occurrence, including overlapping ones', () => {
    const layer = layerWith('aaa');

    expect(occurrencesInLayer(layer, 'aa').map((occurrence) => occurrence.start)).toEqual([0, 1]);
  });

  it('returns nothing for an empty or whitespace-only query', () => {
    const layer = layerWith('alpha');

    expect(occurrencesInLayer(layer, '')).toEqual([]);
    expect(occurrencesInLayer(layer, ' '.repeat(3))).toEqual([]);
  });
});

describe('paintMarks', () => {
  it('paints the current range apart from the other matches and cleans up exactly those', () => {
    const highlights = stubHighlights();
    const layer = layerWith('alpha beta');
    const occurrences = occurrencesInLayer(layer, 'a');
    const [first, second, third] = occurrences;
    if (!first || !second || !third) throw new Error('missing occurrences');

    const cleanup = paintMarks(occurrences.map((occurrence) => occurrence.range), second.range);

    expect([...(highlights.get(PDF_FIND_MATCH) ?? [])]).toEqual([first.range, third.range]);
    expect([...(highlights.get(PDF_FIND_CURRENT) ?? [])]).toEqual([second.range]);

    cleanup();

    expect(highlights.get(PDF_FIND_MATCH)?.size).toBe(0);
    expect(highlights.get(PDF_FIND_CURRENT)?.size).toBe(0);
  });

  it('excludes the current range by identity even when another range covers the same text', () => {
    const highlights = stubHighlights();
    const layer = layerWith('alpha');
    const [first] = occurrencesInLayer(layer, 'alpha');
    const [second] = occurrencesInLayer(layer, 'alpha');
    if (!first || !second) throw new Error('missing occurrences');

    paintMarks([first.range, second.range], second.range);

    expect([...(highlights.get(PDF_FIND_MATCH) ?? [])]).toEqual([first.range]);
    expect([...(highlights.get(PDF_FIND_CURRENT) ?? [])]).toEqual([second.range]);
  });

  it('leaves another painter\'s ranges and the registered highlight alone', () => {
    const highlights = stubHighlights();
    const layer = layerWith('alpha beta');
    const [alpha] = occurrencesInLayer(layer, 'alpha');
    const [beta] = occurrencesInLayer(layer, 'beta');
    if (!alpha || !beta) throw new Error('missing occurrences');

    const firstCleanup = paintMarks([alpha.range], null);
    const registered = highlights.get(PDF_FIND_MATCH);
    const secondCleanup = paintMarks([beta.range], null);

    firstCleanup();
    expect(highlights.get(PDF_FIND_MATCH)).toBe(registered);
    expect([...(highlights.get(PDF_FIND_MATCH) ?? [])]).toEqual([beta.range]);

    secondCleanup();
    expect(highlights.get(PDF_FIND_MATCH)).toBe(registered);
    expect(highlights.get(PDF_FIND_MATCH)?.size).toBe(0);
  });

  it('does nothing when CSS.highlights is missing', () => {
    vi.stubGlobal('CSS', {});
    vi.stubGlobal('Highlight', class extends Set<Range> {});

    const cleanup = paintMarks([document.createRange()], null);

    expect(() => { cleanup(); }).not.toThrow();
  });

  it('does nothing when Highlight is missing', () => {
    const highlights = new Map<string, Set<Range>>();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', undefined);

    const cleanup = paintMarks([document.createRange()], null);
    cleanup();

    expect(highlights.size).toBe(0);
  });
});
