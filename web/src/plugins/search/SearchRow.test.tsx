import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchMatch } from '@shared/plugins/search/shared';
import { SearchRow } from './SearchRow';

const LINE = 18;

let resized: ResizeObserverCallback[] = [];

beforeEach(() => {
  resized = [];
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) { resized.push(callback); }
  });
  // Only the match block's line height is answered; every other element keeps jsdom's own style.
  const original = globalThis.getComputedStyle.bind(globalThis);
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element, pseudo) => (
    element.classList.contains('search-hit-block')
      ? { lineHeight: `${LINE}px` } as CSSStyleDeclaration
      : original(element, pseudo)
  ));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Lay the match line out as a browser would — `lines` display lines tall, with the match's first
// line box on display line `matchLine` — and report the resize the browser would. jsdom lays nothing
// out, so the two boxes the row reads are answered here, on the row's own elements.
function layOut(container: HTMLElement, { lines, matchLine }: { lines: number; matchLine: number }) {
  const block = container.querySelector(':scope .search-hit-block')!;
  const mark = container.querySelector(':scope .search-hit-match')!;
  vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 600, lines * LINE));
  vi.spyOn(mark, 'getClientRects').mockReturnValue(
    [new DOMRect(40, 100 + matchLine * LINE + 2, 30, 14)] as unknown as DOMRectList,
  );
  act(() => { for (const callback of resized) callback([], {} as ResizeObserver); });
}

const row = (overrides: Partial<SearchMatch> = {}): SearchMatch => ({
  path: 'dist/app.min.js', line: 3, above: ['one', 'two'],
  match: `${'x'.repeat(400)}needle${'y'.repeat(400)}`, start: 400, end: 406,
  below: ['four', 'five'], ...overrides,
});

const renderRow = (value: SearchMatch = row()) =>
  render(<SearchRow row={value} index={0} selected={false} onClick={() => {}} onDoubleClick={() => {}} />).container;

const styleOf = (container: HTMLElement, selector: string) =>
  (container.querySelector(`:scope ${selector}`) as HTMLElement).style;

describe('SearchRow match line', () => {
  it('renders the match in its own element between the text around it', () => {
    const container = renderRow(row({ match: '  // todo: fix', start: 5, end: 9 }));
    const block = container.querySelector(':scope .search-hit .search-hit-block')!;
    expect(block.textContent).toBe('  // todo: fix');
    expect(block.querySelector(':scope > .search-hit-match')?.textContent).toBe('todo');
  });

  it('shows five display lines around a match deep in a long line, and no neighbouring lines', () => {
    const container = renderRow();
    layOut(container, { lines: 20, matchLine: 10 });

    // Display lines 8 to 12 of the match line: clipped to five, shifted up by eight.
    expect(styleOf(container, '.search-hit-text').maxHeight).toBe(`${5 * LINE}px`);
    expect(styleOf(container, '.search-hit-block').marginTop).toBe(`${-8 * LINE}px`);
    // The match line supplied both lines on each side, so the neighbouring buffer lines draw none.
    expect(styleOf(container, '.search-context-above').maxHeight).toBe('0px');
    expect(styleOf(container, '.search-context-below').maxHeight).toBe('0px');
  });

  it('keeps the context above a match on the first display line of a long line', () => {
    const container = renderRow();
    layOut(container, { lines: 20, matchLine: 0 });

    expect(styleOf(container, '.search-hit-text').maxHeight).toBe(`${3 * LINE}px`);
    expect(styleOf(container, '.search-hit-block').marginTop).toBe('0px');
    expect(styleOf(container, '.search-context-above').maxHeight).toBe(`${2 * LINE}px`);
    expect(styleOf(container, '.search-context-below').maxHeight).toBe('0px');
  });

  it('leaves a match line that fits on one display line its full context', () => {
    const container = renderRow(row({ match: 'a needle', start: 2, end: 8 }));
    layOut(container, { lines: 1, matchLine: 0 });

    expect(styleOf(container, '.search-hit-text').maxHeight).toBe(`${LINE}px`);
    expect(styleOf(container, '.search-context-above').maxHeight).toBe(`${2 * LINE}px`);
    expect(styleOf(container, '.search-context-below').maxHeight).toBe(`${2 * LINE}px`);
  });

  it('puts no inline cap anywhere while there is no usable measurement', () => {
    // Nothing is laid out, so the stylesheet's own caps are what apply.
    const container = renderRow();
    for (const selector of ['.search-hit-text', '.search-hit-block', '.search-context-above', '.search-context-below']) {
      expect(container.querySelector(`:scope ${selector}`)?.getAttribute('style')).toBeNull();
    }
  });

  it('re-windows the row when the match line is resized', () => {
    const container = renderRow();
    layOut(container, { lines: 20, matchLine: 10 });
    expect(styleOf(container, '.search-hit-block').marginTop).toBe(`${-8 * LINE}px`);

    // A wider pane: the same text now wraps to four lines with the match on the second.
    layOut(container, { lines: 4, matchLine: 1 });

    expect(styleOf(container, '.search-hit-block').marginTop).toBe('0px');
    expect(styleOf(container, '.search-hit-text').maxHeight).toBe(`${4 * LINE}px`);
    expect(styleOf(container, '.search-context-above').maxHeight).toBe(`${LINE}px`);
    expect(styleOf(container, '.search-context-below').maxHeight).toBe('0px');
  });

  it('stops observing the match line when the row goes away', () => {
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = disconnect;
    });
    const { unmount } = render(
      <SearchRow row={row()} index={0} selected={false} onClick={() => {}} onDoubleClick={() => {}} />,
    );
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
