import { describe, it, expect } from 'vitest';
import { textOffsetIn, hitFromEvent } from './mouse';

describe('textOffsetIn', () => {
  it('sums text lengths of preceding text nodes in a cell', () => {
    const cell = document.createElement('div');
    cell.appendChild(document.createTextNode('hello'));
    cell.appendChild(document.createTextNode(' world'));
    const secondNode = cell.childNodes[1];
    expect(textOffsetIn(cell, secondNode, 0)).toBe(5);
    expect(textOffsetIn(cell, secondNode, 3)).toBe(8);
  });

  it('returns 0 when node is the first in the cell', () => {
    const cell = document.createElement('div');
    cell.appendChild(document.createTextNode('hello'));
    expect(textOffsetIn(cell, cell.childNodes[0], 0)).toBe(0);
  });

  it('handles node === cell by summing child text up to offset', () => {
    const cell = document.createElement('div');
    cell.appendChild(document.createTextNode('ab'));
    cell.appendChild(document.createTextNode('cd'));
    expect(textOffsetIn(cell, cell, 1)).toBe(2);
    expect(textOffsetIn(cell, cell, 2)).toBe(4);
  });
});

describe('hitFromEvent', () => {
  function makeRow(line: number): HTMLElement {
    const row = document.createElement('div');
    row.setAttribute('data-editor-line', String(line));
    row.className = 'editor-line';
    const gutter = document.createElement('span');
    gutter.className = 'editor-gutter';
    row.appendChild(gutter);
    const content = document.createElement('span');
    content.className = 'editor-content';
    content.appendChild(document.createTextNode(`line ${line}`));
    row.appendChild(content);
    return row;
  }

  it('returns null when target is not in an editor row', () => {
    const result = hitFromEvent({ target: document.createElement('div'), clientX: 0, clientY: 0 });
    expect(result).toBeNull();
  });

  it('returns line and col for a click on the content cell', () => {
    const row = makeRow(5);
    document.body.appendChild(row);
    const content = row.querySelector('.editor-content')!;
    const result = hitFromEvent({ target: content, clientX: 10, clientY: 10 });
    expect(result).toBeTruthy();
    expect(result!.line).toBe(5);
    expect(result!.inGutter).toBe(false);
    document.body.removeChild(row);
  });

  it('detects gutter clicks', () => {
    const row = makeRow(3);
    const gutter = row.querySelector('.editor-gutter')!;
    document.body.appendChild(row);
    const result = hitFromEvent({ target: gutter, clientX: 5, clientY: 5 });
    expect(result).toBeTruthy();
    expect(result!.line).toBe(3);
    expect(result!.inGutter).toBe(true);
    expect(result!.col).toBe(0);
    document.body.removeChild(row);
  });

  it('returns null for NaN line numbers', () => {
    const row = document.createElement('div');
    row.setAttribute('data-editor-line', 'not-a-number');
    document.body.appendChild(row);
    const result = hitFromEvent({ target: row, clientX: 0, clientY: 0 });
    expect(result).toBeNull();
    document.body.removeChild(row);
  });
});

