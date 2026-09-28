import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VisualizationChartCard, caption, REFRESH_CHOICES } from './VisualizationChartCard';
import { describeChart } from './chart/describe';
import type { VisualizationChart } from '@shared/plugins/visualizations/shared';

const onSetRefresh = vi.fn();
const onRefreshNow = vi.fn();

function chart(over: Partial<VisualizationChart> = {}): VisualizationChart {
  return {
    id: 'chart-1',
    data: { kind: 'source' },
    notes: [],
    refreshSeconds: 0,
    table: {
      columns: [
        { name: 'region', type: 'string' },
        { name: 'revenue', type: 'number' },
      ],
      rows: [['north', 10], ['south', 4]],
      total: 2,
      truncated: false,
    },
    kind: 'bar',
    x: 'region',
    y: 'revenue',
    title: 'Revenue by region',
    ...over,
  };
}

function show(value: VisualizationChart) {
  return render(
    <VisualizationChartCard
      chart={value}
      busy={false}
      disabled={false}
      onSetRefresh={onSetRefresh}
      onRefreshNow={onRefreshNow}
    />,
  );
}

beforeEach(() => {
  onSetRefresh.mockReset();
  onRefreshNow.mockReset();
  cleanup();
});

describe('the live-update control', () => {
  it('steps through the intervals and back to off', () => {
    const steps: number[] = [];
    for (const from of [0, 10, 30, 60, 300]) {
      cleanup();
      onSetRefresh.mockReset();
      show(chart({ refreshSeconds: from }));
      fireEvent.click(screen.getByRole('button', { name: /^Live update is/u }));
      steps.push(onSetRefresh.mock.calls[0]?.[1] as number);
    }
    expect(steps).toEqual([10, 30, 60, 300, 0]);
  });

  it('says where it is and where a click goes', () => {
    show(chart({ refreshSeconds: 30 }));
    const button = screen.getByRole('button', { name: /^Live update is/u });
    expect(button.getAttribute('title')).toBe('Live update is 30s — click for 1m');
  });

  it('offers every interval the feature named, and no others', () => {
    expect(REFRESH_CHOICES.map((choice) => choice.seconds)).toEqual([0, 10, 30, 60, 300]);
  });
});

describe("a chart's other controls", () => {
  it('re-reads only its own data', () => {
    show(chart());
    fireEvent.click(screen.getByRole('button', { name: 'Read the data now' }));
    expect(onRefreshNow).toHaveBeenCalledWith('chart-1');
    expect(onSetRefresh).not.toHaveBeenCalled();
  });

  it('exports the chart, not the visualization', () => {
    show(chart());
    expect(screen.getByRole('button', { name: 'Export this chart as PNG' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export this chart as PDF' })).toBeDefined();
  });

  it('disables every control while the tab is busy or the visualization is gone', () => {
    render(
      <VisualizationChartCard
        chart={chart()}
        busy
        disabled
        onSetRefresh={onSetRefresh}
        onRefreshNow={onRefreshNow}
      />,
    );
    for (const button of document.querySelectorAll('.visualization-card-actions button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('the caption', () => {
  it('says how many rows, how the measure was reduced, and each transformation in order', () => {
    expect(caption(chart({
      aggregate: 'sum',
      notes: ['only year eq \'2024\'', 'the first 10 categories'],
    }))).toBe("2 rows · the sum of revenue · only year eq '2024' · the first 10 categories");
  });

  // A percentile beside a bar is only readable if the caption says which one, and the sentence under a
  // chart is generated from the same marks the renderer draws so the two cannot disagree.
  it('names which percentile the measure was reduced to', () => {
    expect(caption(chart({ aggregate: 'percentile', percentile: 95 })))
      .toContain('the 95th percentile of revenue');
    const middled = chart({ aggregate: 'median' });
    expect(describeChart(middled.table, middled)).toContain('the median of revenue');
  });

  // A chart of months says so on its face. The words are in the caption rather than in the
  // transformation notes because a time unit is not a transformation: nothing was done to the data except
  // to say which day each row belongs to.
  // A percent stack read as an absolute one is a chart that says the wrong thing, and the caption is the
  // only place that can say which of the two it is.
  // Two charts can be drawn identically and mean different things when one is the p95 and the other a
  // mean of the same column, and the caption is the only place that says which is which.
  it('names the measure a chart draws when the user named one', () => {
    expect(caption(chart({ metric: 'p95 latency' }))).toContain('p95 latency');
    expect(caption(chart())).not.toContain('p95 latency');
  });

  it('says how the series are stacked', () => {
    expect(caption(chart({ stack: 'normalize' }))).toContain('as a share of each category');
    expect(caption(chart({ stack: 'zero' }))).toContain('stacked');
    expect(caption(chart())).not.toContain('stacked');
  });

  it('names the time unit a date axis is grouped by', () => {
    expect(caption(chart({ x: 'day', xUnit: 'month' }))).toContain('by month');
    expect(caption(chart())).not.toContain('by month');
  });

  it('says how much of a capped source it is showing', () => {
    const value = chart();
    expect(caption({
      ...value,
      table: { ...value.table, rows: value.table.rows.slice(0, 1), total: 12_043, truncated: true },
    })).toContain('showing 1 of 12043 rows');
  });

  it('names the file a chart came from, so it is not read as a live feed', () => {
    expect(caption(chart({ data: { kind: 'file', path: 'sales.json' } })))
      .toContain('from sales.json, acquired by the agent');
  });

  it('says when the data was read', () => {
    expect(caption(chart({ readAt: Date.UTC(2026, 0, 2, 3, 4) }))).toMatch(/· read \d/u);
  });
});

describe("a chart's text alternative", () => {
  it('carries the data table, generated from the marks it draws', () => {
    const { container } = show(chart());
    // The same sentence appears twice by design — once in the chart's own <desc> and once beside the
    // table — so the assertion is that the two agree, which is the property worth pinning.
    const spoken = container.querySelector('desc')?.textContent;
    expect(container.querySelector('.visualization-data-summary')?.textContent).toBe(spoken);
    const headers = [...container.querySelectorAll(':scope .visualization-data thead th')]
      .map((node) => node.textContent);
    expect(headers).toEqual(['region', 'revenue']);
  });
});
