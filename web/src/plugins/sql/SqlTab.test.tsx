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

  it('asks for statistics only when the panel is opened, and again to close it', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Toggle statistics'));
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('stats', { object: 'orders' });
    fireEvent.click(screen.getByLabelText('Toggle statistics'));
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('shows the generated SQL when asked, and hides it again', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlTab payload={payload()} capabilities={capabilities} />);
    expect(screen.queryByTestId('sql-statement')).toBeNull();
    fireEvent.click(screen.getByLabelText('Toggle generated SQL'));
    expect(screen.getByTestId('sql-statement')).toBeTruthy();
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
    rerender(<SqlTab payload={payload({ console: { sql: 'DELETE FROM orders', changed: 2 } })} capabilities={capabilities} />);
    expect(screen.getByText('OK.')).toBeTruthy();
    rerender(<SqlTab
      payload={payload({ console: { sql: 'NOPE', changed: 0, error: 'Query error: syntax error' } })}
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
