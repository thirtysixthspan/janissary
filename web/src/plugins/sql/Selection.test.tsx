import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import { makeCapabilities, payload } from './fixture';
import { selectionTo, selectionToTsv } from './grid-view';
import { subscribeClipboardCopies } from '../../shared/clipboard-captures';

// The grid's highlighted run of rows and its copy. The grid marks whole rows and never cells, so the
// two questions — which rows does this run cover, and what do they read as — are both about rows.
// The view arithmetic is checked here beside the render that drives it, because the two are one
// question asked from two sides.

function dataCells(): HTMLElement[] {
  return screen.getAllByRole('cell').filter((cell) => !cell.className.includes('gutter')) as HTMLElement[];
}

function selectedRows(): HTMLElement[] {
  return [...document.querySelectorAll('tr.selected')] as HTMLElement[];
}

/** What the highlighted rows read as, one entry per row. */
function highlighted(): string[][] {
  return selectedRows().map((row) => [...row.querySelectorAll('td.sql-cell')].map((cell) => cell.textContent ?? ''));
}

function headers(): HTMLElement[] {
  return [...document.querySelectorAll('td.sql-row-head')] as HTMLElement[];
}

/**
 * The rows with the focus, which is the only state in which the grid answers a key.
 *
 * `fireEvent` answers `false` for a keypress something claimed, so the two questions — did the grid
 * take the key, and did the frame swallow the browser's own — are the same question asked twice.
 */
function focused(): void {
  (screen.getByLabelText('Results') as HTMLElement).focus();
}

const press = (key: string, shiftKey = false) => {
  focused();
  return fireEvent.keyDown(screen.getByLabelText('Results'), { key, shiftKey });
};

function clipboardThat(write: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
}

/**
 * The clipboard keypress, the way a user with a keyboard would make it. The rows hold the focus,
 * because they are the pane whose copy chord this is: text selected in the command bar is the user's,
 * and the grid does not answer over it.
 */
function copyKey() {
  focused();
  return copyKeyOutside();
}

/** The same keypress without moving the focus, for the cases about whose focus it is. */
function copyKeyOutside() {
  const event = new KeyboardEvent('keydown', { key: 'c', metaKey: true, cancelable: true });
  globalThis.dispatchEvent(event);
  return event;
}

function shown(over: Parameters<typeof payload>[0] = {}) {
  const { capabilities } = makeCapabilities();
  const view = render(<DataGrid payload={payload(over)} capabilities={capabilities} />);
  return { capabilities, ...view };
}

// jsdom has no layout and no scrolling, so the scroll the highlight follows is stubbed rather than
// driven — it is the one thing about the movement that is invisible from a render.
const scrollIntoView = vi.fn();

beforeEach(() => { Element.prototype.scrollIntoView = scrollIntoView; scrollIntoView.mockClear(); });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('selectionToTsv', () => {
  const rows = () => [
    { key: 'r1', cells: [{ text: '1', isNull: false }, { text: 'paid', isNull: false }, { text: 'a b', isNull: false }] },
    { key: 'r2', cells: [{ text: '2', isNull: false }, { text: '', isNull: true }, { text: 'c,d', isNull: false }] },
  ];

  it('copies one highlighted row as every cell it holds', () => {
    expect(selectionToTsv(rows(), { from: 0, to: 0 })).toBe('1\tpaid\ta b');
  });

  it('copies a run one line per row', () => {
    expect(selectionToTsv(rows(), { from: 0, to: 1 })).toBe('1\tpaid\ta b\n2\tNULL\tc,d');
  });

  // A null reads as the grid shows it, rather than as an empty cell a paste would turn into a string.
  it('reads a null inside a run as the grid does', () => {
    expect(selectionToTsv(rows(), { from: 1, to: 1 })).toBe('2\tNULL\tc,d');
  });

  // Tab-separated, not CSV: a value holding a comma cannot change the shape of what is pasted.
  it('copies a value containing a comma without quoting it', () => {
    expect(selectionToTsv(rows(), { from: 1, to: 1 })).toContain('c,d');
  });

  it('copies the same rows whichever way the run was taken', () => {
    const range = selectionTo(1, 0);
    expect(selectionToTsv(rows(), range)).toBe('1\tpaid\ta b\n2\tNULL\tc,d');
  });

  it('skips what is not on the page rather than inventing it', () => {
    expect(selectionToTsv(rows(), { from: 0, to: 9 })).toBe('1\tpaid\ta b\n2\tNULL\tc,d');
  });

  it('is empty for a page with no rows in it', () => {
    expect(selectionToTsv([], { from: 0, to: 0 })).toBe('');
  });
});

// The grid marks rows the way the file navigator does: one highlighted row, the keys moving it, and a
// run of rows when shift is held.
describe('the highlighted row', () => {
  it('is the first row as soon as the page arrives, with no key pressed', () => {
    shown();
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('is the first row again after a new query, rather than the row the last one left on', () => {
    const { capabilities, rerender } = shown();
    press('ArrowDown');
    expect(highlighted()).toEqual([['2', 'NULL']]);
    rerender(<DataGrid payload={payload({ offset: 100 })} capabilities={capabilities} />);
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('is nothing at all on a page with no rows', () => {
    shown({ grid: { ...payload().grid!, rows: [] } });
    expect(selectedRows()).toHaveLength(0);
  });

  it('is the whole row, however far into it the press landed', () => {
    shown();
    fireEvent.mouseDown(dataCells()[1] as HTMLElement);
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('is the row a press on the narrow header lands on', () => {
    shown();
    fireEvent.mouseDown(headers()[1] as HTMLElement);
    expect(highlighted()).toEqual([['2', 'NULL']]);
    expect(headers()[1].getAttribute('title')).toBe('Highlight row');
  });

  it('reaches the rows between when shift is held, from a press', () => {
    shown();
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseEnter(headers()[1] as HTMLElement, { shiftKey: true });
    expect(highlighted()).toEqual([['1', 'paid'], ['2', 'NULL']]);
  });

  it('starts over at a plain press rather than extending the old run', () => {
    shown();
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseEnter(headers()[1] as HTMLElement, { shiftKey: true });
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('moves a row at a time with the arrow keys and stops at the ends', () => {
    shown();
    press('ArrowUp');
    expect(highlighted()).toEqual([['1', 'paid']]);
    press('ArrowDown');
    expect(highlighted()).toEqual([['2', 'NULL']]);
    press('ArrowDown');
    expect(highlighted()).toEqual([['2', 'NULL']]);
  });

  it('reaches the first and last row of the page with Home and End', () => {
    shown();
    press('End');
    expect(highlighted()).toEqual([['2', 'NULL']]);
    press('Home');
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('is a run of rows with shift held, and shrinks again on the way back', () => {
    shown();
    press('ArrowDown', true);
    expect(highlighted()).toEqual([['1', 'paid'], ['2', 'NULL']]);
    press('ArrowUp', true);
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('takes a held Home and End to the ends of the page', () => {
    shown();
    press('End', true);
    expect(highlighted()).toEqual([['1', 'paid'], ['2', 'NULL']]);
  });

  // The grid is a list of rows, so the horizontal arrows have nothing to move. They are not the
  // grid's keys, and a key that moves nothing must not also stop the frame scrolling as it otherwise
  // would.
  it('is not moved by the left and right arrows, which the grid does not claim', () => {
    shown();
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      globalThis.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  it('is left by Escape, and starts again on the first row from the next arrow', () => {
    shown();
    press('Escape');
    expect(selectedRows()).toHaveLength(0);
    press('ArrowDown');
    expect(highlighted()).toEqual([['1', 'paid']]);
  });

  // The header is sticky, so the browser's own `nearest` scroll stopped with the first row behind it.
  // The frame is scrolled directly instead, and the first row takes it the whole way back.
  it('scrolls the frame back to the top of the table when the first row is reached again', () => {
    shown();
    press('ArrowDown');
    const frame = screen.getByLabelText('Results');
    frame.scrollTop = 40;
    press('ArrowUp');
    expect(frame.scrollTop).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('brings a row the header is covering out from under it', () => {
    shown();
    const frame = screen.getByLabelText('Results');
    frame.getBoundingClientRect = () => ({ top: 100, bottom: 400 }) as DOMRect;
    Object.defineProperty(frame, 'clientHeight', { value: 300 });
    (frame.querySelector('thead') as HTMLElement).getBoundingClientRect = () => ({ height: 30 }) as DOMRect;
    (frame.querySelector('[data-row="1"]') as HTMLElement).getBoundingClientRect = () => ({ top: 110, bottom: 130 }) as DOMRect;
    frame.scrollTop = 60;
    press('ArrowDown');
    expect(frame.scrollTop).toBe(40);
  });

  // The editor is a second press on a cell. A press that highlights the row must not open one, or
  // reading down a table would open an editor on every row it passed.
  it('is highlighted by a press, and only a second press opens the editor', () => {
    const { container } = shown();
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    expect(container.querySelector('.sql-cell-editor')).toBeNull();
    fireEvent.doubleClick(dataCells()[0] as HTMLElement);
    expect(container.querySelector('.sql-cell-editor')).not.toBeNull();
  });
});

describe('copying a run of rows', () => {
  // There is no copy control in this tab. The platform's chord is the one, and the window listener
  // that answers it is the whole of the copy behaviour — so these are the only route there is.
  it('writes the highlighted rows to the clipboard from the platform copy key', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown();
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseDown(headers()[1] as HTMLElement, { shiftKey: true });
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1\tpaid\n2\tNULL'));
  });

  it('copies one highlighted row, which is one line', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown();
    fireEvent.mouseDown(headers()[1] as HTMLElement);
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('2\tNULL'));
  });

  it('offers no control to copy with', () => {
    shown();
    expect(screen.queryByLabelText('Copy selection')).toBeNull();
  });

  // This grid keeps its own clipboard write so a denied copy can say why (see the test below), which
  // means it is the one copy site that cannot route through `copyText`. It still has to reach the one
  // capture seam, or SQL results would be missing from the clipboard-history popup.
  it('publishes the copied rows to the clipboard-captures seam', async () => {
    clipboardThat(vi.fn().mockResolvedValue(undefined));
    const seen: string[] = [];
    const unsubscribe = subscribeClipboardCopies((text) => { seen.push(text); });
    shown();
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseDown(headers()[1] as HTMLElement, { shiftKey: true });

    copyKey();

    await vi.waitFor(() => expect(seen).toEqual(['1\tpaid\n2\tNULL']));
    unsubscribe();
  });

  // The copy reads the page's own row array, so a run expressed in the table's numbering would point
  // past its end on every page but the first — and would highlight correctly while copying nothing.
  it('writes the same text from a page that is not the first', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown({ offset: 100 });
    fireEvent.mouseDown(headers()[1] as HTMLElement);
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('2\tNULL'));
  });

  it('says the text in the error band when the clipboard is withheld, rather than doing nothing', async () => {
    clipboardThat(vi.fn().mockRejectedValue(new Error('denied')));
    shown();
    copyKey();
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('1'));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  // A plugin tab stays mounted while another tab covers it, so a window-level listener that ignored
  // `active` would copy from a grid the user is not looking at.
  it('does not listen for the copy key while another tab covers this one', () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={{ ...capabilities, active: false }} />);
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    copyKey();
    expect(write).not.toHaveBeenCalled();
  });

  // The grid's copy chord is the grid's. The window listener is there so a key pressed on a row's own
  // control still copies, and it is the focus that tells it whether the keystroke was the grid's at all.
  it('does not take the copy key while something outside the rows has the focus', () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown();
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    const event = copyKeyOutside();
    expect(write).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    outside.remove();
  });

  it('leaves a text selection inside a cell to the browser, so Copy still gets the word', () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown();
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseDown(headers()[1] as HTMLElement, { shiftKey: true });
    // Both ends inside one cell: a word the user selected there, not a run. A collapsed selection is
    // what a plain press leaves behind, and that is the browser's nothing to keep.
    const word = dataCells()[1]?.firstChild as Node;
    browserSelection(word, word, 'paid');
    const event = copyKey();
    expect(write).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  // A shift-click leaves a browser selection over the very cells the run covers, running from
  // wherever the caret landed in the first to the end of the last — so standing aside for any
  // non-empty selection handed the copy key that one, and a pasted run lost its first value.
  it('copies the run whole even when a shift-click left a browser selection over the same cells', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown();
    const cells = dataCells();
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseDown(headers()[1] as HTMLElement, { shiftKey: true });
    browserSelection(cells[0]?.firstChild as Node, cells[3]?.lastChild as Node, '\tpaid');
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1\tpaid\n2\tNULL'));
  });

  it('copies the first row without a press at all, because that is what is highlighted', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    shown();
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1\tpaid'));
  });
});

// The two selections are told apart by where their ends are, so the browser's own selection has to
// answer with those ends rather than with text. `getSelection` is stubbed rather than driven, since
// jsdom neither makes a selection from a click nor keeps one.
function browserSelection(anchorNode: Node, focusNode: Node, text: string) {
  vi.spyOn(globalThis, 'getSelection').mockReturnValue({
    isCollapsed: false, anchorNode, focusNode, toString: () => text,
  } as unknown as Selection);
}
