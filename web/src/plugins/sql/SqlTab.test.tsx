import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SqlTab } from './SqlTab';
import { makeCapabilities, payload } from './fixture';

describe('SqlTab layout', () => {
  it('shows the navigator beside the grid in the centre, with no Schema/Data switch', () => {
    const { capabilities } = makeCapabilities(null);
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.getByRole('tree', { name: 'Schema' })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('shows one at a time in a sidebar, and switches between them', () => {
    const { capabilities } = makeCapabilities('left');
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('tree', { name: 'Schema' })).toBeNull();
    fireEvent.click(screen.getByText('Schema'));
    expect(screen.getByRole('tree', { name: 'Schema' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  // The pane is the box the stylesheet bounds the grid in; a grid outside it would be laid out
  // against nothing and paint over the command bar. The rule and the class have to agree.
  it('puts the grid in a bounded pane beside the navigator, which is what keeps it out of the bar', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<SqlTab payload={payload()} capabilities={capabilities} />);
    const body = container.querySelector('.sql-body') as HTMLElement;
    const pane = body.querySelector('.sql-grid-pane') as HTMLElement;
    expect(pane.querySelector('.sql-grid-area')).toBeTruthy();
    expect(pane.querySelector('.sql-grid-scroll')).toBeTruthy();
    expect(body.querySelector('.sql-nav-pane')).toBeTruthy();
  });

  it('marks both layouts for the documentation screenshot', () => {
    const centre = makeCapabilities(null);
    const { container } = render(<SqlTab payload={payload()} capabilities={centre.capabilities} />);
    const shot = container.querySelector<HTMLElement>('[data-doc-shot="sql-tab"]');
    expect(shot?.dataset.docked).toBe('false');
    const docked = makeCapabilities('right');
    render(<SqlTab payload={payload()} capabilities={docked.capabilities} />);
    expect(screen.getAllByText('Schema').length).toBeGreaterThan(0);
  });
});

describe('SqlTab header', () => {
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

  it('asks for statistics only when the panel is opened, and again to close it', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Toggle statistics'));
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('stats', { object: 'orders' });
    fireEvent.click(screen.getByLabelText('Toggle statistics'));
    expect(intent).toHaveBeenCalledTimes(1);
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

  // The server already had everything an export needs; what was missing was anything that asked for
  // one, so the header's export links could only ever be empty.
  it('asks for each format by name, from the control beside the grid', () => {
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

  it('offers neither format before the navigator has chosen an object', () => {
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

  it('shows what the last statement did, or why it did not', () => {
    const { capabilities } = makeCapabilities();
    const { rerender } = render(<SqlTab payload={payload()} capabilities={capabilities} />);
    rerender(<SqlTab payload={payload({ log: [{ sql: 'DELETE FROM orders', changed: 2 }] })} capabilities={capabilities} />);
    expect(screen.getByText('OK.')).toBeTruthy();
    rerender(<SqlTab
      payload={payload({ log: [{ sql: 'NOPE', changed: 0, error: 'Query error: syntax error' }] })}
      capabilities={capabilities}
    />);
    expect(screen.getByText('Query error: syntax error')).toBeTruthy();
  });

  it('shows the console as busy while a request is outstanding', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(
      <SqlTab payload={payload({ pending: { id: 'q1', followUp: 'query' } })} capabilities={capabilities} />,
    );
    expect(container.querySelector('.dot.busy')).toBeTruthy();
  });
});
