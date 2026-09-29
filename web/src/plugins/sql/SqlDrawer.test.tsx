import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SqlDrawer } from './SqlDrawer';
import { StatsPanel } from './StatsPanel';
import { makeCapabilities, payload } from './fixture';

describe('SqlDrawer', () => {
  it('shows the statement that ran with its placeholders, and the values bound into it', () => {
    const { capabilities } = makeCapabilities();
    const withFilter = payload({
      grid: {
        ...payload().grid!,
        sql: 'SELECT "id" FROM "orders" WHERE "status" = ? ORDER BY "id" ASC LIMIT ? OFFSET ?',
        parameters: ['paid', 100, 0],
      },
    });
    render(<SqlDrawer payload={withFilter} capabilities={capabilities} />);
    expect(screen.getByTestId('sql-statement').textContent).toContain('WHERE "status" = ?');
    expect(screen.getByText('["paid",100,0]')).toBeTruthy();
  });

  it('shows no value inline, so a copy of the statement cannot mean something else', () => {
    const { capabilities } = makeCapabilities();
    const withQuote = payload({
      grid: { ...payload().grid!, parameters: ["it's"], sql: 'SELECT "id" FROM "orders" WHERE "c" = ?' },
    });
    render(<SqlDrawer payload={withQuote} capabilities={capabilities} />);
    expect(screen.getByTestId('sql-statement').textContent).not.toContain("it's");
  });

  it('copies the statement and its parameters, and says that it did', async () => {
    const write = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: write } });
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload()} capabilities={capabilities} />);
    await fireEvent.click(screen.getByText('Copy'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('-- Parameters:'));
  });

  it('asks to run the statement with its values filled in, while still showing the placeholder', () => {
    const { capabilities, intent } = makeCapabilities();
    const sql = 'SELECT "id" FROM "orders" WHERE "status" = ? LIMIT ? OFFSET ?';
    const filtered = payload({ grid: { ...payload().grid!, sql, parameters: ['paid', 100, 0] } });
    render(<SqlDrawer payload={filtered} capabilities={capabilities} />);
    fireEvent.click(screen.getByText('Run'));
    expect(intent).toHaveBeenCalledWith('run', {
      sql: `SELECT "id" FROM "orders" WHERE "status" = 'paid' LIMIT 100 OFFSET 0`,
    });
    // The panel still shows what executed, placeholders and all — the two are different on purpose.
    expect(screen.getByTestId('sql-statement').textContent).toContain('= ?');
  });

  it('draws nothing without a statement to show', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<SqlDrawer payload={payload({ grid: null })} capabilities={capabilities} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('the statement log', () => {
  const log = [
    { sql: 'UPDATE orders SET status = ?', changed: 2 },
    { sql: 'DELETE FROM logs', changed: 1 },
    { sql: 'UPDATE nope', changed: 0, error: 'no such table: nope' },
  ];

  it('shows every statement before the current one, newest first', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload({ log })} capabilities={capabilities} />);
    const entries = screen.getAllByRole('listitem').map((entry) => entry.querySelector('.sql-log-sql')?.textContent);
    // The newest entry is the console line's business, not the list's.
    expect(entries).toEqual(['DELETE FROM logs', 'UPDATE nope']);
  });

  it('reports what each statement did, and the failure that stopped it', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload({ log })} capabilities={capabilities} />);
    expect(screen.getByText('1 row changed.')).toBeTruthy();
    expect(screen.getByText('no such table: nope')).toBeTruthy();
  });

  it('lifts one statement at a time, which is how a session is read', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload({ log })} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Copy DELETE FROM logs'));
    expect(write).toHaveBeenCalledWith('DELETE FROM logs');
    vi.unstubAllGlobals();
  });

  it('names the statement it copied, so two copies in a row are not confused', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload({ log })} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Copy DELETE FROM logs'));
    await vi.waitFor(() => expect(screen.getAllByText('Copied').length).toBeGreaterThan(0));
    vi.unstubAllGlobals();
  });

  it('clears the log on request', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SqlDrawer payload={payload({ log })} capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear log' }));
    expect(intent).toHaveBeenCalledWith('clear-log', {});
  });

  it('carries no list at all on a tab that has written nothing', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload({ log: [] })} capabilities={capabilities} />);
    expect(screen.queryByText('Earlier statements')).toBeNull();
  });

  it('still shows the log when there is no grid statement to show above it', () => {
    const { capabilities } = makeCapabilities();
    render(<SqlDrawer payload={payload({ grid: null, log })} capabilities={capabilities} />);
    expect(screen.getByText('DELETE FROM logs')).toBeTruthy();
  });
});

describe('StatsPanel', () => {
  it('draws one bar per value, scaled to the largest count', () => {
    render(<StatsPanel columns={[{
      name: 'status', type: 'TEXT', nulls: 0, distinct: 2, total: 30,
      values: [{ label: 'paid', count: 20 }, { label: 'open', count: 10 }],
    }]} />);
    const widths = [...document.querySelectorAll<HTMLElement>('.sql-bar-fill')].map((node) => node.style.width);
    expect(widths).toEqual(['100%', '50%']);
  });

  it('draws a count instead of bars for a column with too many values to chart', () => {
    render(<StatsPanel columns={[{
      name: 'id', type: 'INTEGER', nulls: 0, distinct: 900, total: 900, values: [],
    }]} />);
    expect(screen.getByText('900 distinct')).toBeTruthy();
    expect(screen.getByText('Too many distinct values to chart.')).toBeTruthy();
    expect(document.querySelectorAll('.sql-bar')).toHaveLength(0);
  });

  it('reports the null count, and min and max for a numeric column', () => {
    render(<StatsPanel columns={[{
      name: 'total', type: 'REAL', nulls: 3, distinct: 4, total: 100,
      min: '1.5', max: '99', values: [{ label: '1.5', count: 97 }],
    }]} />);
    expect(screen.getByText('3 null')).toBeTruthy();
    expect(screen.getByText('min 1.5')).toBeTruthy();
    expect(screen.getByText('max 99')).toBeTruthy();
  });

  it('omits a null count of zero rather than drawing an empty row', () => {
    render(<StatsPanel columns={[{
      name: 'a', type: 'TEXT', nulls: 0, distinct: 1, total: 1, values: [{ label: 'x', count: 1 }],
    }]} />);
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('says so when there is nothing to report yet', () => {
    render(<StatsPanel columns={[]} />);
    expect(screen.getByText('No statistics yet.')).toBeTruthy();
  });
});
