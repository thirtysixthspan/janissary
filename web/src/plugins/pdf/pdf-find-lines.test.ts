import { describe, expect, it } from 'vitest';
import { pageLines, type PdfTextItem } from './pdf-find-lines';

function item(text: string, hasEOL = false, top = 0): PdfTextItem {
  return { text, hasEOL, top };
}

describe('pdf page lines', () => {
  it('joins items into a line and splits at every hasEOL, including the final run', () => {
    const items = [
      item('Alpha'),
      item('beta', true, 0.1),
      item('Gamma', true, 0.2),
      item('Delta', false, 0.3),
    ];

    expect(pageLines(2, items)).toEqual([
      { text: 'Alphabeta', page: 2, index: 0, top: 0 },
      { text: 'Gamma', page: 2, index: 1, top: 0.2 },
      { text: 'Delta', page: 2, index: 2, top: 0.3 },
    ]);
  });

  it('keeps an empty line an empty hasEOL item begins and counts it in the indexes', () => {
    const items = [item('', true, 0.1), item('Next', false, 0.2)];

    expect(pageLines(0, items)).toEqual([
      { text: '', page: 0, index: 0, top: 0.1 },
      { text: 'Next', page: 0, index: 1, top: 0.2 },
    ]);
  });

  it('keeps an empty line when the whole page is one empty hasEOL item', () => {
    expect(pageLines(0, [item('', true, 0.25)])).toEqual([
      { text: '', page: 0, index: 0, top: 0.25 },
    ]);
  });

  it('ends the current text line without adding a second empty line', () => {
    expect(pageLines(0, [item('Line', false, 0.1), item('', true, 0.2)])).toEqual([
      { text: 'Line', page: 0, index: 0, top: 0.1 },
    ]);
  });

  it('adds no trailing line after a last item that ends its line', () => {
    expect(pageLines(0, [item('End', true)])).toEqual([
      { text: 'End', page: 0, index: 0, top: 0 },
    ]);
  });

  it('emits one line for items with no hasEOL and no lines for no items', () => {
    expect(pageLines(0, [item(''), item('')])).toEqual([
      { text: '', page: 0, index: 0, top: 0 },
    ]);
    expect(pageLines(0, [])).toEqual([]);
  });

  it('keeps two identical lines as two entries', () => {
    expect(pageLines(0, [item('Same', true, 0.1), item('Same', true, 0.2)])).toEqual([
      { text: 'Same', page: 0, index: 0, top: 0.1 },
      { text: 'Same', page: 0, index: 1, top: 0.2 },
    ]);
  });

  it('takes the line top from its first item, even an empty one', () => {
    const items = [item('', false, 0.4), item('Text', true, 0.5)];

    expect(pageLines(3, items)).toEqual([
      { text: 'Text', page: 3, index: 0, top: 0.4 },
    ]);
  });

  it('concatenates items with no added separators and preserves their spaces', () => {
    const items = [item(' left '), item('and'), item(' right ', false)];

    expect(pageLines(0, items)[0]?.text).toBe(' left and right ');
  });
});
