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
});

describe('copying a selection', () => {
  function withRun() {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const cells = dataCells();
    fireEvent.mouseDown(cells[0] as HTMLElement);
    fireEvent.mouseDown(cells[1] as HTMLElement, { shiftKey: true });
  }

  it('writes the rendered text to the clipboard from the control', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    withRun();
    fireEvent.click(screen.getByLabelText('Copy selection'));
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1\tpaid'));
  });

  it('writes the same text from the keyboard', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    clipboardThat(write);
    withRun();
    copyKey();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('1\tpaid'));
  });

  it('says the text in the error band when the clipboard is withheld, rather than doing nothing', async () => {
    clipboardThat(vi.fn().mockRejectedValue(new Error('denied')));
    withRun();
    fireEvent.click(screen.getByLabelText('Copy selection'));
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('1\tpaid'));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('offers nothing to copy until a cell is chosen', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    expect((screen.getByLabelText('Copy selection') as HTMLButtonElement).disabled).toBe(true);
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
    withRun();
    vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => 'paid' } as unknown as Selection);
    const event = copyKey();
    expect(write).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
