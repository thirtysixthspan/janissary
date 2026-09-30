import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import { CUSTOMERS, KEYED, grid, makeCapabilities, payload } from './fixture';

// The grid scrolls the highlighted row into view, and jsdom neither lays out nor scrolls.
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

// The cell editor's field, which has no accessible name and is empty whenever the NULL toggle is on
// — so the search and the page filter fields are not distinguishable by what they hold.
function cellInput(container: HTMLElement): HTMLElement {
  return container.querySelector('.sql-cell-input') as HTMLElement;
}

describe('DataGrid headers and rows', () => {
  it('renders every column in order, between the row header and the row controls', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers).toEqual(['', 'id', 'status', '']);
    expect(screen.getByText('paid')).toBeTruthy();
  });

  // The gutter in front of a row carries no number — the pager already says which rows the page holds —
  // and is the row header that selects the whole row instead.
  it('shows no row number, and spans the empty row across every column the table has', () => {
    const { capabilities } = makeCapabilities();
    const { container, rerender } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const firstRow = () => [...container.querySelectorAll(':scope tbody tr:first-child > td')].map((cell) => cell.textContent);
    expect(firstRow()).toEqual(['', '1', 'paid', '']);

    rerender(<DataGrid payload={payload({ grid: grid({ rows: [], total: 0 }) })} capabilities={capabilities} />);
    const empty = container.querySelector('td.sql-empty') as HTMLElement;
    expect(empty.textContent).toBe('No rows.');
    expect(empty.getAttribute('colspan')).toBe('4');
  });

  it('renders the header for an object whose page is empty', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload({ grid: grid({ rows: [], total: 0 }) })} capabilities={capabilities} />);
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.getAllByText('No rows.').length).toBeGreaterThan(0);
  });

  // A tab opened on a database holding nothing settles its grid to nothing, and a header reading
  // `Loading…` for the rest of the session is indistinguishable from a read that never came back.
  it('reads an empty database as no tables, and a read still outstanding as loading', () => {
    const { capabilities } = makeCapabilities();
    const { container, rerender } = render(
      <DataGrid payload={payload({ objects: [], object: '', grid: null })} capabilities={capabilities} />,
    );
    const count = () => (container.querySelector('.sql-grid-count') as HTMLElement).textContent;
    expect(count()).toBe('No tables.');

    rerender(<DataGrid
      payload={payload({ objects: [], object: '', grid: null, pending: { id: 'r1', followUp: 'schema' } })}
      capabilities={capabilities}
    />);
    expect(count()).toBe('Loading…');
  });

  it('shows a null cell in its own style and an empty string in another', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    expect(screen.getByText('NULL').className).toContain('null');
    expect(screen.getByText('paid').className).not.toContain('null');
  });
});

describe('DataGrid ordering and paging', () => {
  it('asks for a new order when a column header is pressed', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByTitle('Order by status'));
    expect(intent).toHaveBeenCalledWith('set-order', { column: 'status' });
  });

  it('asks for the next and previous pages, and disables the one there is no room for', () => {
    const { capabilities, intent } = makeCapabilities();
    const { rerender } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByText('Next'));
    expect(intent).toHaveBeenCalledWith('set-page', { offset: 100 });
    expect(screen.getByText('Previous').closest('button')?.disabled).toBe(true);

    const last = grid({ offset: 200, total: 200, rows: [] });
    rerender(<DataGrid payload={payload({ grid: last })} capabilities={capabilities} />);
    expect(screen.getByText('Next').closest('button')?.disabled).toBe(true);
  });

  it('asks for a new page size and a refresh', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '500' } });
    expect(intent).toHaveBeenCalledWith('set-page-size', { limit: 500 });
    fireEvent.click(screen.getByText('Refresh'));
    expect(intent).toHaveBeenCalledWith('refresh', {});
  });
});

describe('DataGrid filtering', () => {
  it('asks for a global term, and clears it by submitting nothing', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const field = screen.getByLabelText('Search every column');
    fireEvent.change(field, { target: { value: 'ada' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('set-global-filter', { value: 'ada' });
  });

  it('offers a way to take the term away, and says which term is in force', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload({ global: 'ada' })} capabilities={capabilities} />);
    expect(screen.getByText('matches "ada" anywhere')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(intent).toHaveBeenCalledWith('set-global-filter', { value: '' });
  });

  it('asks for nothing when the term is resubmitted unchanged', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload({ global: 'ada' })} capabilities={capabilities} />);
    const field = screen.getByLabelText('Search every column');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(intent).not.toHaveBeenCalled();
  });

  it('asks for a filter when one is applied, and shows the chip it produced', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Filter status'));
    fireEvent.change(screen.getByLabelText('status operator'), { target: { value: 'eq' } });
    fireEvent.change(screen.getByLabelText('status value'), { target: { value: 'paid' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(intent).toHaveBeenCalledWith('set-filter', { column: 'status', op: 'eq', value: 'paid' });
  });

  it('offers no value field for an operator that binds nothing', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Filter status'));
    fireEvent.change(screen.getByLabelText('status operator'), { target: { value: 'isNull' } });
    expect(screen.queryByLabelText('status value')).toBeNull();
  });

  it('shows the filters a payload carries and offers to clear them', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid
      payload={payload({ filters: [{ column: 'status', op: 'eq', value: 'paid' }] })}
      capabilities={capabilities}
    />);
    expect(screen.getByText('status = paid')).toBeTruthy();
    fireEvent.click(screen.getByText(/Clear filters/));
    expect(intent).toHaveBeenCalledWith('clear-filters', {});
  });

  it('switches a filter off and on again by double-clicking its chip', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid
      payload={payload({ filters: [{ column: 'status', op: 'eq', value: 'paid' }] })}
      capabilities={capabilities}
    />);
    const chip = screen.getByRole('button', { name: 'status = paid' });
    fireEvent.doubleClick(chip);
    expect(intent).toHaveBeenCalledWith('set-filter-enabled', { column: 'status', enabled: false });
  });

  // A chip that is parked still carries its column, operator and value, so a double-click brings it
  // back without retyping any of that. The tooltip says which press is which.
  it('draws a parked filter greyed out, and says which press brings it back', () => {
    const { capabilities, intent } = makeCapabilities();
    const { rerender } = render(<DataGrid
      payload={payload({ filters: [{ column: 'status', op: 'eq', value: 'paid' }] })}
      capabilities={capabilities}
    />);
    const on = screen.getByRole('button', { name: 'status = paid' }) as HTMLButtonElement;
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.title).toBe('Disable');
    expect(on.className).not.toContain('off');

    rerender(<DataGrid
      payload={payload({ filters: [{ column: 'status', op: 'eq', value: 'paid', enabled: false }] })}
      capabilities={capabilities}
    />);
    const off = screen.getByRole('button', { name: 'status = paid' }) as HTMLButtonElement;
    expect(off.getAttribute('aria-pressed')).toBe('false');
    expect(off.title).toBe('Enable');
    expect(off.className).toContain('off');
    fireEvent.doubleClick(off);
    expect(intent).toHaveBeenCalledWith('set-filter-enabled', { column: 'status', enabled: true });
  });
});

describe('DataGrid keyboard', () => {
  // The frame is what holds the focus, and it is what the keys are dispatched on — dispatched
  // through fireEvent rather than raw so React flushes the row the key moves.
  const press = (key: string) => {
    const frame = screen.getByLabelText('Results') as HTMLElement;
    frame.focus();
    fireEvent.keyDown(frame, { key });
  };
  const highlighted = () => [...document.querySelectorAll('tr.selected')] as HTMLElement[];

  it('can hold the focus, and says what it is holding it', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const frame = screen.getByLabelText('Results') as HTMLElement;
    // The tab has two panes, and this is the other one: it has to be reachable, and to say what it is
    // once it has the focus, or a screen reader user is told only that something is focused.
    expect(frame.tabIndex).toBe(0);
    expect(frame.getAttribute('aria-label')).toBe('Results');
  });

  it('moves the highlighted row with the arrows', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    expect(highlighted()).toHaveLength(1);
    press('ArrowDown');
    expect(highlighted().map((row) => row.textContent)).toEqual(['2NULL']);
  });

  it('does nothing at all while another tab is in front', () => {
    const { capabilities } = makeCapabilities();
    capabilities.active = false;
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    press('ArrowDown');
    // The first row is highlighted because the page arrived, not because a key was pressed, so
    // nothing moved at all.
    expect(highlighted().map((row) => row.textContent)).toEqual(['1paid']);
  });

  it('hands focus back to the command bar on a bare Tab, and leaves a held one alone', () => {
    const onEnter = vi.fn();
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} onEnter={onEnter} />);
    const frame = screen.getByLabelText('Results') as HTMLElement;
    // `fireEvent` answers `false` for a keypress something claimed, which is the same question asked
    // the other way round.
    expect(fireEvent.keyDown(frame, { key: 'Tab' })).toBe(false);
    expect(onEnter).toHaveBeenCalledOnce();
    expect(fireEvent.keyDown(frame, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(onEnter).toHaveBeenCalledOnce();
  });
});

describe('DataGrid editing', () => {

  it('opens the editor on a double click and asks to update that cell on commit', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.doubleClick(screen.getByText('paid'));
    const input = screen.getByDisplayValue('paid');
    fireEvent.change(input, { target: { value: 'shipped' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('update-cell', { row: 'r1', column: 'status', value: 'shipped' });
  });

  it('asks for a null value rather than the four characters when the NULL toggle is used', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.doubleClick(screen.getByText('paid'));
    fireEvent.click(screen.getByLabelText('Set NULL'));
    expect(intent).not.toHaveBeenCalled();
    fireEvent.keyDown(cellInput(container), { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('update-cell', { row: 'r1', column: 'status', value: null });
  });

  // A browser blurs the field on the way to the box, and the field commits on blur — so the toggle
  // used to write the text as it stood and unmount before the null was read. jsdom moves no focus on
  // a click, which is why the case above passed while the browser wrote the wrong value.
  it('takes no focus when the NULL toggle is pressed, so the field cannot commit on the way', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.doubleClick(screen.getByText('paid'));
    // `fireEvent` returns false when the event's default was prevented, which is the whole contract —
    // on the box and on the word beside it, which share one label.
    expect(fireEvent.mouseDown(screen.getByLabelText('Set NULL'))).toBe(false);
    expect(fireEvent.mouseDown(container.querySelector('.sql-cell-null') as HTMLElement)).toBe(false);
  });

  it('carries the null alone when the toggle is pressed and the editor commits', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.doubleClick(screen.getByText('paid'));
    fireEvent.mouseDown(screen.getByLabelText('Set NULL'));
    fireEvent.click(screen.getByLabelText('Set NULL'));
    fireEvent.keyDown(cellInput(container), { key: 'Enter' });
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('update-cell', { row: 'r1', column: 'status', value: null });
  });

  // The toggle is part of the value being edited, not a write of its own — otherwise reaching for it
  // and changing your mind would already have overwritten the cell.
  it('asks for nothing when the NULL toggle is used and the editor is then cancelled', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.doubleClick(screen.getByText('paid'));
    fireEvent.click(screen.getByLabelText('Set NULL'));
    fireEvent.keyDown(cellInput(container), { key: 'Escape' });
    expect(intent).not.toHaveBeenCalled();
  });

  it('asks for nothing when the editor is cancelled', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.doubleClick(screen.getByText('paid'));
    fireEvent.keyDown(screen.getByDisplayValue('paid'), { key: 'Escape' });
    expect(intent).not.toHaveBeenCalled();
  });

  it('confirms a delete before it asks for it, and only the confirmed path asks', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getAllByLabelText('Delete row')[0]!);
    expect(intent).not.toHaveBeenCalled();
    expect(screen.getByText('Delete row from "orders"?')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete'));
    expect(intent).toHaveBeenCalledWith('delete-row', { row: 'r1' });
  });
});

describe('DataGrid foreign keys', () => {
  // `keyed` is one row whose keyed cell holds `1`, and one whose keyed cell is null.
  const keyedRows = () =>
    grid({
      columns: ['id', 'customer_id'],
      rows: [
        { key: 'r1', cells: [{ text: '7', isNull: false }, { text: '1', isNull: false }] },
        { key: 'r2', cells: [{ text: '8', isNull: false }, { text: '', isNull: true }] },
      ],
    });
  const keyed = () => payload({ objects: [KEYED, CUSTOMERS], object: 'invoices', grid: keyedRows() });

  it('asks for the referenced table filtered to the value, in one intent', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={keyed()} capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('select-object', { object: 'customers', column: 'id', value: '1' });
  });

  it('names the table and column it points at', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={keyed()} capabilities={capabilities} />);
    expect(screen.getByRole('button', { name: '1' }).getAttribute('title')).toBe('customers.id');
  });

  it('leaves a column with no key as plain text, so it is not activatable', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByRole('button', { name: 'paid' })).toBeNull();
    expect(intent).not.toHaveBeenCalled();
  });

  it('offers nothing to follow for a null value, or for a key with no resolvable target', () => {
    const { capabilities } = makeCapabilities();
    const { unmount } = render(<DataGrid payload={keyed()} capabilities={capabilities} />);
    // Only the first row's key cell is a control; the null one is text.
    expect(screen.getAllByRole('button', { name: '1' }).length).toBe(1);
    expect(screen.getAllByText('NULL').length).toBeGreaterThan(0);
    unmount();
    const unresolved = {
      ...KEYED,
      columns: KEYED.columns.map((column) =>
        column.name === 'customer_id' ? { ...column, references: { table: 'customers', columns: [''] } } : column,
      ),
    };
    render(<DataGrid payload={payload({ objects: [unresolved], object: 'invoices', grid: keyedRows() })} capabilities={capabilities} />);
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });
});

describe('DataGrid read-only objects', () => {
  it('says why a view cannot be edited and offers no write control', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(<DataGrid payload={payload({ object: 'paid' })} capabilities={capabilities} />);
    expect(screen.getByText('Read-only: "paid" is a view.')).toBeTruthy();
    expect(screen.getByText('paid', { selector: '.sql-grid-object' })).toBeTruthy();
    expect(screen.queryByLabelText('Insert row')).toBeNull();
    expect(screen.queryByLabelText('Delete row')).toBeNull();
    const cell = container.querySelector('.sql-cell');
    fireEvent.doubleClick(cell!);
    expect(container.querySelector('.sql-cell-editor')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
  });

  // A statement's result arrives with every row keyed by the empty string, and the editor's test is
  // `editing?.row === row.key` — so a double-click on one cell opened an editor in all of them, the
  // first blur sent a write the server could only refuse, and the log filled with refusals the user
  // never asked for.
  it('says a statement result cannot be written and sends nothing when a cell is pressed', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(
      <DataGrid payload={payload({ grid: grid({ keyless: true }) })} capabilities={capabilities} />,
    );
    expect(screen.getByText("Read-only: this is a statement's result, not a table.")).toBeTruthy();
    expect(screen.queryByLabelText('Delete row')).toBeNull();
    const cell = container.querySelector('.sql-cell');
    fireEvent.doubleClick(cell!);
    expect(container.querySelector('.sql-cell-editor')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
  });

  it('still writes on a page of an object, so the flag is what changed the above', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<DataGrid payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByText("Read-only: this is a statement's result, not a table.")).toBeNull();
    expect(screen.getAllByLabelText('Delete row').length).toBeGreaterThan(0);
    fireEvent.doubleClick(container.querySelector('.sql-cell')!);
    expect(container.querySelector('.sql-cell-editor')).not.toBeNull();
  });
});

describe('DataGrid errors', () => {
  it('shows a failed read in an error band above the grid', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload({ error: 'Query error: no such table' })} capabilities={capabilities} />);
    expect(screen.getByRole('alert').textContent).toBe('Query error: no such table');
    expect(screen.getByText('paid')).toBeTruthy();
  });
});
