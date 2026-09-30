import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import { makeCapabilities, payload } from './fixture';
import { selectionTo, selectionToTsv } from './grid-view';

// The grid's selection and its copy. The view arithmetic is checked here beside the render that
// drives it, because the two questions are the same question: which cells does this run cover, and
// what do they read as.

function dataCells(): HTMLElement[] {
  return screen.getAllByRole('cell').filter((cell) => !cell.className.includes('gutter')) as HTMLElement[];
}

function selectedCells(): HTMLElement[] {
  return dataCells().filter((cell) => cell.className.includes('selected'));
}

function clipboardThat(write: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
}

/** The clipboard keypress, the way a user with a keyboard would make it. */
function copyKey() {
  const event = new KeyboardEvent('keydown', { key: 'c', metaKey: true, cancelable: true });
  globalThis.dispatchEvent(event);
  return event;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('selectionToTsv', () => {
  const rows = () => [
    { key: 'r1', cells: [{ text: '1', isNull: false }, { text: 'paid', isNull: false }, { text: 'a b', isNull: false }] },
    { key: 'r2', cells: [{ text: '2', isNull: false }, { text: '', isNull: true }, { text: 'c,d', isNull: false }] },
  ];
  const columns = ['id', 'status', 'note'];

  it('copies one cell as itself', () => {
    expect(selectionToTsv(rows(), columns, { row: 0, cell: 0 }, { row: 0, cell: 0 })).toBe('1');
  });

  it('copies a run one line per row, tab-separated', () => {
    expect(selectionToTsv(rows(), columns, { row: 0, cell: 0 }, { row: 1, cell: 1 })).toBe('1\tpaid\n2\tNULL');
  });

  it('copies one column down the page', () => {
    expect(selectionToTsv(rows(), columns, { row: 0, cell: 2 }, { row: 1, cell: 2 })).toBe('a b\nc,d');
  });

  // A null reads as the grid shows it, rather than as an empty cell a paste would turn into a string.
  it('reads a null inside a run as the grid does', () => {
    expect(selectionToTsv(rows(), columns, { row: 1, cell: 1 }, { row: 1, cell: 1 })).toBe('NULL');
  });

  // Tab-separated, not CSV: a value holding a comma cannot change the shape of what is pasted.
  it('copies a value containing a comma without quoting it', () => {
    expect(selectionToTsv(rows(), columns, { row: 1, cell: 2 }, { row: 1, cell: 2 })).toBe('c,d');
  });

  it('copies the same rectangle whichever way the run was dragged', () => {
    const { from, to } = selectionTo({ row: 0, cell: 1 }, { row: 1, cell: 0 });
    expect(selectionToTsv(rows(), columns, from, to)).toBe('1\tpaid\n2\tNULL');
  });

  it('skips what is not on the page rather than inventing it', () => {
    expect(selectionToTsv(rows(), columns, { row: 0, cell: 0 }, { row: 9, cell: 9 })).toBe('1\tpaid\ta b\n2\tNULL\tc,d');
  });

  it('is empty for a range with nothing in it', () => {
    expect(selectionToTsv([], columns, { row: 0, cell: 0 }, { row: 0, cell: 0 })).toBe('');
  });
});

describe('a run of cells', () => {
  function shown() {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
  }

  it('marks every cell it covers, and only those', () => {
    // The fixture page is 2 rows of 2 columns, so a run from the first cell to the last covers four.
    shown();
    const cells = dataCells();
    fireEvent.mouseDown(cells[0] as HTMLElement);
    fireEvent.mouseEnter(cells[3] as HTMLElement, { shiftKey: true });
    expect(selectedCells()).toHaveLength(4);
  });

  it('extends to a single cell across as well as a whole run', () => {
    // Cell 2 is the first cell of the second row, so this run is one column deep, not one row.
    shown();
    const cells = dataCells();
    fireEvent.mouseDown(cells[0] as HTMLElement);
    fireEvent.mouseEnter(cells[2] as HTMLElement, { shiftKey: true });
    expect(selectedCells()).toHaveLength(2);
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', '2']);
  });

  it('starts over at a plain click rather than extending the old run', () => {
    shown();
    const cells = dataCells();
    fireEvent.mouseDown(cells[0] as HTMLElement);
    fireEvent.mouseEnter(cells[3] as HTMLElement, { shiftKey: true });
    fireEvent.mouseDown(cells[1] as HTMLElement);
    expect(selectedCells()).toHaveLength(1);
  });

  it('is forgotten when a new page arrives, so cells are not marked that now hold other values', () => {
    const { capabilities } = makeCapabilities();
    const { rerender } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    expect(selectedCells()).toHaveLength(1);
    rerender(<DataGrid payload={payload({ offset: 100 })} capabilities={capabilities} />);
    expect(selectedCells()).toHaveLength(0);
  });

  // The run is the grid's own selection, so the browser must not leave a second one over the same
  // cells. A press that extends a run is cancelled; a plain one is not, because collapsing the caret
  // is what lets a user then select a word inside that cell and press Copy for the word.
  it('claims a press that extends a run from the browser, and leaves a plain press to it', () => {
    shown();
    const cell = dataCells()[0] as HTMLElement;
    expect(fireEvent.mouseDown(cell)).toBe(true);
    expect(fireEvent.mouseDown(cell, { shiftKey: true })).toBe(false);
    expect(fireEvent.mouseDown([...document.querySelectorAll('td.sql-row-head')][0] as HTMLElement, { shiftKey: true })).toBe(false);
  });
});

// A row is the widest run there is, so selecting one is selecting a rectangle the page already knows
// how to copy. What is new is reaching it: a header to click, and the file navigator's keys.
describe('a whole row', () => {
  const press = (key: string, shiftKey = true) => {
    fireEvent.keyDown(document.body, { key, shiftKey });
  };
  const headers = () => [...document.querySelectorAll('td.sql-row-head')] as HTMLElement[];

  it('is selected by one click on its header, and by nothing else', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', 'paid']);
    expect(headers()[0].getAttribute('title')).toBe('Select row');
  });

  it('extends to the rows between when shift is held, still full width', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(headers()[0] as HTMLElement);
    fireEvent.mouseEnter(headers()[1] as HTMLElement, { shiftKey: true });
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', 'paid', '2', 'NULL']);
  });

  it('is selected by the file navigator keys, from a cell cursor', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    // Nothing marked yet, so the first shift-arrow starts the run on the first row.
    press('ArrowDown');
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', 'paid']);
    press('ArrowDown');
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', 'paid', '2', 'NULL']);
    press('ArrowUp');
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', 'paid']);
  });

  it('steps by one and stops at the ends, as a list does', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    press('ArrowUp');
    expect(selectedCells()).toHaveLength(2);
    press('End');
    expect(selectedCells().map((cell) => cell.textContent)).toEqual(['1', 'paid', '2', 'NULL']);
    press('End');
    expect(selectedCells()).toHaveLength(4);
    press('Home');
    expect(selectedCells()).toHaveLength(2);
  });

  // The cell cursor and the row selection are two ways of marking one grid, so Escape has to leave
  // neither behind — a cursor that cannot be seen cannot be moved either.
  it('is left by Escape, along with the cell cursor', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    press('ArrowRight', false);
    expect(dataCells().filter((cell) => cell.className.includes('selected'))).toHaveLength(1);
    press('ArrowDown');
    expect(selectedCells()).toHaveLength(2);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(selectedCells()).toHaveLength(0);
  });

  it('is left by Escape when a click started the run, with no cell cursor behind it', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    expect(selectedCells()).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(selectedCells()).toHaveLength(0);
  });

  it('is left by Escape from a row run started with shift, with no cell cursor behind it', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    // Nothing marked, and no cell cursor either: the first shift-arrow starts the run on row one.
    press('ArrowDown');
    press('ArrowDown');
    expect(selectedCells().length).toBeGreaterThan(1);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(selectedCells()).toHaveLength(0);
  });

  it('copies as one tab-separated line, which is what a row pastes as', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(headers()[1] as HTMLElement);
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('2\tNULL'));
  });
});

describe('copying a selection', () => {
  // There is no copy control in this tab. The platform's chord is the one, and the window listener
  // that answers it is the whole of the copy behaviour — so these are the only route there is.
  it('writes the rendered text to the clipboard from the platform copy key', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    fireEvent.mouseDown(dataCells()[1] as HTMLElement, { shiftKey: true });
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1	paid'));
  });

  it('offers no control to copy with', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByLabelText('Copy selection')).toBeNull();
  });

  // The copy reads the page's own row array, so a selection expressed in the table's numbering would
  // point past its end on every page but the first — and would highlight correctly while copying
  // nothing at all.
  it('writes the same text from a page that is not the first', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload({ offset: 100 })} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    fireEvent.mouseDown(dataCells()[1] as HTMLElement, { shiftKey: true });
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1	paid'));
  });

  it('says the text in the error band when the clipboard is withheld, rather than doing nothing', async () => {
    clipboardThat(vi.fn().mockRejectedValue(new Error('denied')));
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    copyKey();
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('1'));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  // A plugin tab stays mounted while another tab covers it, so a window-level listener that ignored
  // `active` would copy from a grid the user is not looking at.
  it('does not listen for the copy key while another tab covers this one', () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities: hidden } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={{ ...hidden, active: false }} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    copyKey();
    expect(write).not.toHaveBeenCalled();
  });

  it('leaves a text selection inside a cell to the browser, so Copy still gets the word', () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[0] as HTMLElement);
    fireEvent.mouseDown(dataCells()[1] as HTMLElement, { shiftKey: true });
    // Both ends inside one cell: a word the user selected there, not a run. A collapsed selection is
    // what a plain click or a keyboard run leaves behind, and that is the browser's nothing to keep.
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
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const cells = dataCells();
    fireEvent.mouseDown(cells[0] as HTMLElement);
    fireEvent.mouseDown(cells[1] as HTMLElement, { shiftKey: true });
    browserSelection(cells[0]?.firstChild as Node, cells[1]?.lastChild as Node, '\tpaid');
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1\tpaid'));
  });

  it('copies a single clicked cell, which a plain click leaves nothing selected in the browser', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.mouseDown(dataCells()[1] as HTMLElement);
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('paid'));
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
