import { describe, it, expect, vi, afterEach } from 'vitest';
import { textOffsetIn, pointToCol, hitFromEvent } from './mouse';

type DocWithCaretPos = {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

describe('textOffsetIn', () => {
  it('sums text lengths of preceding text nodes in a cell', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('hello'));
    cell.append(document.createTextNode(' world'));
    const secondNode = cell.childNodes[1];
    expect(textOffsetIn(cell, secondNode, 0)).toBe(5);
    expect(textOffsetIn(cell, secondNode, 3)).toBe(8);
  });

  it('returns 0 when node is the first in the cell', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('hello'));
    expect(textOffsetIn(cell, cell.firstChild!, 0)).toBe(0);
  });

  it('handles node === cell by summing child text up to offset', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('ab'));
    cell.append(document.createTextNode('cd'));
    expect(textOffsetIn(cell, cell, 1)).toBe(2);
    expect(textOffsetIn(cell, cell, 2)).toBe(4);
  });

  it('returns total text length when walker does not find node', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('hello'));
    cell.append(document.createTextNode(' world'));
    const span = document.createElement('span');
    span.textContent = '!';
    cell.append(span);
    expect(textOffsetIn(cell, span, 0)).toBe(12);
  });
});

describe('pointToCol', () => {
  afterEach(() => {
    delete (document as unknown as DocWithCaretPos).caretPositionFromPoint;
  });

  it('returns column from caretPositionFromPoint', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('hello world'));
    const textNode = cell.firstChild!;
    (document as unknown as DocWithCaretPos).caretPositionFromPoint = vi.fn().mockReturnValue({ offsetNode: textNode, offset: 6 });
    expect(pointToCol(cell, 0, 0)).toBe(6);
  });

  it('returns 0 when caretPositionFromPoint returns null', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('hello'));
    (document as unknown as DocWithCaretPos).caretPositionFromPoint = vi.fn().mockReturnValue(null);
    expect(pointToCol(cell, 0, 0)).toBe(0);
  });

  it('returns 0 when caret node is outside the cell', () => {
    const cell = document.createElement('div');
    cell.append(document.createTextNode('hello'));
    const outside = document.createTextNode('outside');
    document.body.append(outside);
    (document as unknown as DocWithCaretPos).caretPositionFromPoint = vi.fn().mockReturnValue({ offsetNode: outside, offset: 3 });
    expect(pointToCol(cell, 0, 0)).toBe(0);
    outside.remove();
  });
});

describe('hitFromEvent', () => {
  function makeRow(line: number): HTMLElement {
    const row = document.createElement('div');
    row.dataset.editorLine = String(line);
    row.className = 'editor-line';
    const gutter = document.createElement('span');
    gutter.className = 'editor-gutter';
    row.append(gutter);
    const content = document.createElement('span');
    content.className = 'editor-content';
    content.append(document.createTextNode(`line ${line}`));
    row.append(content);
    return row;
  }

  it('returns null when target is not in an editor row', () => {
    const result = hitFromEvent({ target: document.createElement('div'), clientX: 0, clientY: 0 });
    expect(result).toBeNull();
  });

  it('returns line and col for a click on the content cell', () => {
    const row = makeRow(5);
    document.body.append(row);
    const content = row.querySelector('.editor-content')!;
    const result = hitFromEvent({ target: content, clientX: 10, clientY: 10 });
    expect(result).toBeTruthy();
    expect(result!.line).toBe(5);
    expect(result!.inGutter).toBe(false);
    row.remove();
  });

  it('detects gutter clicks', () => {
    const row = makeRow(3);
    const gutter = row.querySelector('.editor-gutter')!;
    document.body.append(row);
    const result = hitFromEvent({ target: gutter, clientX: 5, clientY: 5 });
    expect(result).toBeTruthy();
    expect(result!.line).toBe(3);
    expect(result!.inGutter).toBe(true);
    expect(result!.col).toBe(0);
    row.remove();
  });

  it('returns null for NaN line numbers', () => {
    const row = document.createElement('div');
    row.dataset.editorLine = 'not-a-number';
    document.body.append(row);
    const result = hitFromEvent({ target: row, clientX: 0, clientY: 0 });
    expect(result).toBeNull();
    row.remove();
  });
});

