import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SqlTab } from './SqlTab';
import { grid, makeCapabilities, payload } from './fixture';

// The tab carries the grid, and the grid scrolls the highlighted row into view, which jsdom neither
// lays out nor does.
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

describe('SqlTab layout', () => {
  // A harness tab is one metadata row across the full width and one body below it. This is the same
  // shape, rebuilt with the plugin's own classes because a plugin may not reach the host's.
  it('is the same tab in a sidebar, with no Schema/Data switch to press', () => {
    const { capabilities } = makeCapabilities('left');
    const { container } = render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(container.querySelectorAll('.sql-meta')).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('marks both layouts for the documentation screenshot', () => {
    const centre = makeCapabilities(null);
    const { container } = render(<SqlTab payload={payload()} capabilities={centre.capabilities} />);
    const shot = container.querySelector<HTMLElement>('[data-doc-shot="sql-tab"]');
    expect(shot?.dataset.docked).toBe('false');
    const docked = makeCapabilities('right');
    const narrow = render(<SqlTab payload={payload()} capabilities={docked.capabilities} />);
    const narrowShot = narrow.container.querySelector<HTMLElement>('[data-doc-shot="sql-tab"]');
    expect(narrowShot?.dataset.docked).toBe('true');
  });
});

describe('SqlTab metadata row', () => {
  it('offers every database and asks to open the one chosen', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload({
      databases: [{ name: 'shop', exists: true, open: true }, { name: 'blog', exists: true, open: false }],
    })} capabilities={capabilities} />);
    const select = screen.getByLabelText('Database') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['shop', 'blog']);
    fireEvent.change(select, { target: { value: 'blog' } });
    expect(intent).toHaveBeenCalledWith('open', { name: 'blog' });
  });

  // A browser tab is not where a database gets made: `db sqlite create <name>` is, and it prints what
  // it did. The list is the registry's databases and nothing else, so there is no name to be typed.
  it('offers nothing to start a name being typed, so the only way to make a database is a command', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload({
      databases: [{ name: 'shop', exists: true, open: true }],
    })} capabilities={capabilities} />);
    const select = screen.getByLabelText('Database') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['shop']);
    expect(screen.queryByLabelText('New database name')).toBeNull();
    expect(screen.queryByText('Create')).toBeNull();
  });

  it('links each export through the authenticated resource URL', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload({
      exports: [{ name: 'shop-orders-1.csv', size: '1.2 kB', rows: 2, ref: '/open/7' }],
    })} capabilities={capabilities} />);
    const link = screen.getByText('shop-orders-1.csv').closest('a');
    expect(link?.getAttribute('href')).toBe('/open/7?token=test');
    expect(link?.getAttribute('download')).toBe('shop-orders-1.csv');
  });

  // The command bar is the only place SQL is entered, so there is no second control for it and no
  // panel showing a statement the user did not type.
  // Everything the tab can do to an object, in one row: the two switches that choose it and the four
  // controls that act on it. Three controls that used to be here are gone, and this is where that is
  // pinned — a statistics panel, a generated-SQL panel, and a copy button the platform's own key does.
  it('carries both switches and the object actions, and no control that is gone', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const row = container.querySelector('.sql-meta') as HTMLElement;
    expect(row.querySelector('.sql-meta-actions')).toBeTruthy();
    for (const name of ['Database', 'Table', 'Insert row', 'Choose columns']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    for (const name of ['CSV', 'JSON']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    for (const gone of ['Toggle statistics', 'Toggle generated SQL', 'Copy selection']) {
      expect(screen.queryByLabelText(gone)).toBeNull();
    }
  });

  it('offers no insert control for an object that cannot be written to', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload({ object: 'paid' })} capabilities={capabilities} />);
    expect(screen.queryByLabelText('Insert row')).toBeNull();
  });

  // A statement's result is read-only the way a view is, and it sits over a table the tab may well be
  // able to write to — so the form has to go with the rest of the write controls rather than offering
  // columns of a table the grid is not showing.
  it('offers no insert control over a statement result, however writable its table is', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload({ grid: grid({ keyless: true }) })} capabilities={capabilities} />);
    expect(screen.getByText("Read-only: this is a statement's result, not a table.")).toBeTruthy();
    expect(screen.queryByLabelText('Insert row')).toBeNull();
  });

  it('opens the insert form from the row, which is where the control now lives', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByLabelText('New status')).toBeNull();
    fireEvent.click(screen.getByLabelText('Insert row'));
    expect(screen.getByLabelText('New status')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Insert row'));
    expect(screen.queryByLabelText('New status')).toBeNull();
  });

  it('opens the column chooser from the row', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByLabelText('Choose columns', { selector: 'input' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Choose columns'));
    expect(screen.getByRole('checkbox', { name: 'status' })).toBeTruthy();
  });

  it('offers no control for showing or re-running a statement', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByLabelText('Toggle generated SQL')).toBeNull();
    expect(screen.queryByTestId('sql-statement')).toBeNull();
    expect(screen.queryByText('Run')).toBeNull();
  });
});

describe('SqlTab export', () => {
  const csv = () => screen.getByRole('button', { name: 'CSV' }) as HTMLButtonElement;
  const json = () => screen.getByRole('button', { name: 'JSON' }) as HTMLButtonElement;

  it('asks for each format by name', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    fireEvent.click(csv());
    expect(intent).toHaveBeenCalledWith('export', { format: 'csv' });
    fireEvent.click(json());
    expect(intent).toHaveBeenCalledWith('export', { format: 'json' });
  });

  // The tab waits on one request at a time, so an export asked for while a read is still running
  // would be answered after it and replace the page it was meant to describe.
  it('offers neither format while another request is outstanding, and both again once it lands', () => {
    const { capabilities, intent } = makeCapabilities();
    const { rerender } = render(
      <SqlTab payload={payload({ pending: { id: 'q1', followUp: 'query' } })} capabilities={capabilities} />,
    );
    expect(csv().disabled).toBe(true);
    expect(json().disabled).toBe(true);
    fireEvent.click(csv());
    expect(intent).not.toHaveBeenCalled();

    rerender(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(csv().disabled).toBe(false);
    expect(json().disabled).toBe(false);
  });

  it('offers neither format before an object has been chosen', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload({ object: '', grid: null })} capabilities={capabilities} />);
    expect(csv().disabled).toBe(true);
    fireEvent.click(json());
    expect(intent).not.toHaveBeenCalled();
  });

  // A read-only object cannot be edited, but its whole query can still be read out as a file.
  it('offers both for a view, which cannot be written but can be exported', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload({ object: 'paid' })} capabilities={capabilities} />);
    expect(csv().disabled).toBe(false);
    expect(json().disabled).toBe(false);
  });
});

describe('SqlTab console', () => {
  it('asks the host to run what was typed', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const bar = screen.getByLabelText('SQL');
    fireEvent.change(bar, { target: { value: 'SELECT 1' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('run', { sql: 'SELECT 1' });
  });

  // The shared keymap steps back from the end of the list it is handed, so a list kept newest-first
  // recalled the oldest statement first — and a user reaching for what they just ran edited and
  // re-ran something from before it, which on this surface is a write.
  it('recalls the statement typed last on one ArrowUp, and the one before it on the next', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const bar = screen.getByLabelText('SQL');
    for (const sql of ['UPDATE orders SET total = 1 WHERE id = 1', 'UPDATE orders SET total = 2 WHERE id = 2']) {
      fireEvent.change(bar, { target: { value: sql } });
      fireEvent.keyDown(bar, { key: 'Enter' });
    }
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect((bar as HTMLTextAreaElement).value).toBe('UPDATE orders SET total = 2 WHERE id = 2');
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect((bar as HTMLTextAreaElement).value).toBe('UPDATE orders SET total = 1 WHERE id = 1');
  });

  it('hands back the draft when the walk comes back down past the newest statement', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const bar = screen.getByLabelText('SQL');
    for (const sql of ['SELECT 1', 'SELECT 2']) {
      fireEvent.change(bar, { target: { value: sql } });
      fireEvent.keyDown(bar, { key: 'Enter' });
    }
    fireEvent.change(bar, { target: { value: 'half typed' } });
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect((bar as HTMLTextAreaElement).value).toBe('SELECT 2');
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect((bar as HTMLTextAreaElement).value).toBe('half typed');
  });

  // The ghost walks the same list from its other end, so the completion offered while typing was
  // drawn from the oldest entry that matched rather than the newest.
  it('offers the most recent statement that extends what is typed', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const bar = screen.getByLabelText('SQL');
    for (const sql of ['SELECT id FROM orders', 'SELECT id FROM customers']) {
      fireEvent.change(bar, { target: { value: sql } });
      fireEvent.keyDown(bar, { key: 'Enter' });
    }
    fireEvent.change(bar, { target: { value: 'SELECT id FROM' } });
    expect(container.querySelector('.ghost')?.textContent).toBe('SELECT id FROM customers');
  });

  it('recalls a re-sent statement as the newest, so the list is a history and not a log', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const bar = screen.getByLabelText('SQL');
    for (const sql of ['SELECT 1', 'SELECT 2', 'SELECT 1']) {
      fireEvent.change(bar, { target: { value: sql } });
      fireEvent.keyDown(bar, { key: 'Enter' });
    }
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect((bar as HTMLTextAreaElement).value).toBe('SELECT 1');
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect((bar as HTMLTextAreaElement).value).toBe('SELECT 2');
  });

  // A result is a notification now, not a line in the tab. A line here was the first thing the next
  // keystroke replaced and the first thing lost when the user looked at another tab, so the tab keeps
  // nothing under the prompt at all.
  it('has no line under the prompt, because a result is a notification', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(document.querySelector('.sql-console-result')).toBeNull();
    expect(container.querySelector('.sql-console')?.textContent).toBe('SQL ');
  });

  it('shows the console as busy while a request is outstanding', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(
      <SqlTab payload={payload({ pending: { id: 'q1', followUp: 'query' } })} capabilities={capabilities} />,
    );
    expect(container.querySelector('.dot.busy')).toBeTruthy();
  });
});

describe('the insert form', () => {
  function opened(over = {}) {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload(over)} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Insert row'));
    return intent;
  }

  it('writes nothing at all when the control is pressed, which is the whole point of it', () => {
    // A row used to land in the database on this click, before a value was typed.
    expect(opened()).not.toHaveBeenCalled();
  });

  it('offers an input for every column, so the form is a picture of the row', () => {
    opened();
    expect(screen.getByLabelText('New id')).toBeTruthy();
    expect(screen.getByLabelText('New status')).toBeTruthy();
  });

  it('previews the statement the save will run', () => {
    opened();
    expect(screen.getByTestId('sql-insert-statement').textContent)
      .toBe('INSERT INTO "orders" ("id") VALUES (?)');
  });

  it('sends only the columns that were given a value', () => {
    const intent = opened();
    fireEvent.change(screen.getByLabelText('New status'), { target: { value: 'open' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(intent).toHaveBeenCalledWith('insert-row', {
      object: 'orders',
      cells: [{ column: 'id', value: null }, { column: 'status', value: 'open' }],
    });
  });

  // A column the insert does not name is stored as whatever the table's own DEFAULT says, which is
  // the whole reason a form should leave one out rather than write a null over it.
  it('does not name a column left alone, so its default runs', () => {
    const intent = opened();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(intent).toHaveBeenCalledWith('insert-row', {
      object: 'orders',
      cells: [{ column: 'id', value: null }],
    });
  });

  it('leaves the primary key as the one column a new row names without being asked', () => {
    opened();
    expect((screen.getByLabelText('id is null') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('status is null') as HTMLInputElement).checked).toBe(false);
  });

  it('turning the NULL toggle off leaves the column unnamed, and on again names it null', () => {
    const intent = opened();
    fireEvent.click(screen.getByLabelText('status is null'));
    fireEvent.click(screen.getByLabelText('status is null'));
    expect(screen.getByTestId('sql-insert-statement').textContent)
      .toBe('INSERT INTO "orders" ("id") VALUES (?)');
    fireEvent.click(screen.getByLabelText('status is null'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(intent).toHaveBeenCalledWith('insert-row', {
      object: 'orders',
      cells: [{ column: 'id', value: null }, { column: 'status', value: null }],
    });
  });

  it('disables a field whose column is null, so a typed value cannot be a silent contradiction', () => {
    opened();
    expect((screen.getByLabelText('New id') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('status is null'));
    expect((screen.getByLabelText('New status') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('status is null'));
    expect((screen.getByLabelText('New status') as HTMLInputElement).disabled).toBe(false);
  });

  it('closes without writing on Cancel', () => {
    const intent = opened();
    fireEvent.change(screen.getByLabelText('New status'), { target: { value: 'open' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0] as HTMLElement);
    expect(intent).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('New status')).toBeNull();
  });
});

describe('the column chooser', () => {
  it('asks for the whole hidden set when a column is toggled', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Choose columns'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'status' }));
    expect(intent).toHaveBeenCalledWith('set-columns', { hidden: ['status'] });
  });

  it('takes every column back at once', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload({ hidden: ['status'] })} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Choose columns'));
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(intent).toHaveBeenCalledWith('set-columns', { hidden: [] });
  });

  it('says how many are hidden on the control that opens the chooser', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload({ hidden: ['status'] })} capabilities={capabilities} />);
    expect(screen.getByLabelText('Choose columns').title).toContain('1 hidden');
  });

  // The host's Split is drawn as a table's columns, so a column glyph here would be two answers to
  // one question. What this control is about is what the grid shows, and an eye is not that glyph.
  it('is not drawn as the split glyph, so the two controls apart are not the same shape', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const glyph = screen.getByLabelText('Choose columns').querySelector('svg') as SVGElement;
    expect(glyph.dataset.icon).toBe('eye');
    expect(glyph.dataset.icon).not.toBe('table-columns');
  });
});

