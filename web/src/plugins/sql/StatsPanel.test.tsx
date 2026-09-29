import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SqlStatsColumn } from '@shared/plugins/sql/shared';
import { StatsPanel } from './StatsPanel';

// The per-column panel. What matters is which line a column gets: bars when its values are few
// enough to draw, a count and a line saying why when they are not, and nothing that contradicts the
// figures printed above it.

function column(over: Partial<SqlStatsColumn> = {}): SqlStatsColumn {
  return {
    name: 'status', type: 'TEXT', nulls: 0, distinct: 2, total: 4,
    values: [{ label: 'open', count: 3 }, { label: 'paid', count: 1 }], ...over,
  };
}

const barWidths = () => [...document.querySelectorAll('.sql-bar-fill')]
  .map((fill) => (fill as HTMLElement).style.width);

describe('StatsPanel', () => {
  it('draws one bar per value, scaled to the largest', () => {
    render(<StatsPanel columns={[column()]} />);
    expect(barWidths()).toEqual(['100%', '33.33333333333333%']);
  });

  it('keeps the bars it does draw in step with the figure above them', () => {
    const uneven = column({ values: [{ label: 'a', count: 1 }, { label: 'b', count: 4 }] });
    render(<StatsPanel columns={[uneven]} />);
    expect(barWidths()).toEqual(['25%', '100%']);
  });

  it('says a column has too many to chart when its values are not drawn, and draws no bars', () => {
    const wide = column({ distinct: 500, values: [] });
    const { container } = render(<StatsPanel columns={[wide]} />);
    expect(screen.getByText('Too many distinct values to chart.')).toBeTruthy();
    expect(container.querySelectorAll('.sql-bar')).toHaveLength(0);
  });

  it('renders the minimum and maximum of a numeric column', () => {
    render(<StatsPanel columns={[column({ type: 'REAL', min: '10.0', max: '50.0' })]} />);
    expect(screen.getByText('min 10.0')).toBeTruthy();
    expect(screen.getByText('max 50.0')).toBeTruthy();
  });

  it('renders no minimum or maximum for a column that has none', () => {
    const { container } = render(<StatsPanel columns={[column()]} />);
    expect(container.textContent).not.toContain('min ');
    expect(container.textContent).not.toContain('max ');
  });

  it('renders no null figure for a column with no nulls, and one when it has them', () => {
    const { container, rerender } = render(<StatsPanel columns={[column({ nulls: 0 })]} />);
    expect(container.textContent).not.toContain('null');
    rerender(<StatsPanel columns={[column({ nulls: 3 })]} />);
    expect(screen.getByText('3 null')).toBeTruthy();
  });

  it('names the column and its declared type, or ANY when it declared none', () => {
    const { rerender } = render(<StatsPanel columns={[column()]} />);
    expect(screen.getByText('status')).toBeTruthy();
    expect(screen.getByText('TEXT')).toBeTruthy();
    rerender(<StatsPanel columns={[column({ type: '' })]} />);
    expect(screen.getByText('ANY')).toBeTruthy();
  });

  it('says so when it has nothing to report', () => {
    render(<StatsPanel columns={[]} />);
    expect(screen.getByText('No statistics yet.')).toBeTruthy();
  });
});
