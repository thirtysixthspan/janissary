import { describe, it, expect, vi, afterEach } from 'vitest';
import { textOffsetIn, pointToCol, hitFromEvent, visualVerticalHit } from './mouse';

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

describe('visualVerticalHit', () => {
  afterEach(() => {
    delete (document as unknown as DocWithCaretPos).caretPositionFromPoint;
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    vi.restoreAllMocks();
  });

  function makeRect(overrides: Partial<DOMRect>): DOMRect {
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...overrides };
  }

  it('returns null when the caret has no real layout (zero-height rect, e.g. jsdom)', () => {
    const body = document.createElement('div');
    const caret = document.createElement('span');
    body.append(caret);
    expect(visualVerticalHit(body, caret, 'down')).toBeNull();
    expect(visualVerticalHit(body, caret, 'up')).toBeNull();
  });

  it('resolves a point one line-height below the caret for dir "down"', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const row = document.createElement('div');
    row.dataset.editorLine = '3';
    const content = document.createElement('span');
    content.className = 'editor-content';
    const text = document.createTextNode('line three');
    content.append(text);
    row.append(content);
    container.append(row);
    const caret = document.createElement('span');
    container.append(caret);

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 0, bottom: 100, height: 100 }));
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 0, bottom: 14, left: 5, height: 14 }));
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = vi.fn().mockReturnValue(content);
    (document as unknown as DocWithCaretPos).caretPositionFromPoint = vi.fn().mockReturnValue({ offsetNode: text, offset: 2 });

    const hit = visualVerticalHit(container, caret, 'down');
    expect(hit).toEqual({ line: 3, col: 2, inGutter: false });

    container.remove();
  });

  function makeContainerWithRows(lines: number[]): { container: HTMLElement; caret: HTMLElement } {
    const container = document.createElement('div');
    document.body.append(container);
    for (const line of lines) {
      const row = document.createElement('div');
      row.dataset.editorLine = String(line);
      const content = document.createElement('span');
      content.className = 'editor-content';
      content.append(document.createTextNode(`line ${line}`));
      row.append(content);
      container.append(row);
    }
    const caret = document.createElement('span');
    container.append(caret);
    return { container, caret };
  }

  it('returns null instead of clamping when the caret is scrolled out of view above the body', () => {
    const { container, caret } = makeContainerWithRows([0, 1, 2]);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 120, height: 100 }));
    vi.spyOn(container.querySelector('[data-editor-line]')!, 'getBoundingClientRect').mockReturnValue(makeRect({ top: -50, bottom: -36, height: 14 }));
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: -36, bottom: -22, left: 5, height: 14 }));
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = vi.fn().mockReturnValue(null);

    expect(visualVerticalHit(container, caret, 'down')).toBeNull();
    expect(visualVerticalHit(container, caret, 'up')).toBeNull();

    container.remove();
  });

  it('returns null instead of clamping when the probe point falls below the visible body', () => {
    const { container, caret } = makeContainerWithRows([0, 1, 2]);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 120, height: 100 }));
    vi.spyOn(container.querySelector('[data-editor-line]')!, 'getBoundingClientRect').mockReturnValue(makeRect({ top: -50, bottom: -36, height: 14 }));
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 106, bottom: 120, left: 5, height: 14 }));
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = vi.fn().mockReturnValue(null);

    expect(visualVerticalHit(container, caret, 'down')).toBeNull();

    container.remove();
  });

  it('returns null instead of clamping when the probe point falls above the visible body', () => {
    const { container, caret } = makeContainerWithRows([0, 1, 2]);
    const header = document.createElement('div');
    document.body.append(header);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 120, height: 100 }));
    vi.spyOn(container.querySelector('[data-editor-line]')!, 'getBoundingClientRect').mockReturnValue(makeRect({ top: -50, bottom: -36, height: 14 }));
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 34, left: 5, height: 14 }));
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = vi.fn().mockReturnValue(header);

    expect(visualVerticalHit(container, caret, 'up')).toBeNull();

    header.remove();
    container.remove();
  });

  it('resolves a point one line-height above the caret for dir "up"', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const row = document.createElement('div');
    row.dataset.editorLine = '1';
    const content = document.createElement('span');
    content.className = 'editor-content';
    const text = document.createTextNode('line one');
    content.append(text);
    row.append(content);
    container.append(row);
    const caret = document.createElement('span');
    container.append(caret);

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 0, bottom: 100, height: 100 }));
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 14, bottom: 28, left: 5, height: 14 }));
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = vi.fn().mockReturnValue(content);
    (document as unknown as DocWithCaretPos).caretPositionFromPoint = vi.fn().mockReturnValue({ offsetNode: text, offset: 4 });

    const hit = visualVerticalHit(container, caret, 'up');
    expect(hit).toEqual({ line: 1, col: 4, inGutter: false });

    container.remove();
  });
});

