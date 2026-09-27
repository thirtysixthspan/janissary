import React from 'react';
import { DEFAULT_VIEW, type ChartView, type SortOrder } from './chart/view';

// The three ways of looking at a chart more closely without asking anyone. Every one of them is a
// labelled control rather than a gesture on the chart: a bar is easy to click and a line is not, and a
// filter nobody can reach from the keyboard is not a filter most people will use.

export type ControlsProperties = {
  view: ChartView;
  // The categories present in the chart, in the order they are drawn, which is what the filter offers.
  labels: readonly string[];
  onChange(view: ChartView): void;
};

const ORDERS: readonly { value: SortOrder; label: string }[] = [
  { value: 'source', label: 'As read' },
  { value: 'category', label: 'By category' },
  { value: 'value', label: 'By value, largest first' },
];

const CAPS = [0, 5, 10, 20] as const;

export function ChartControls({ view, labels, onChange }: ControlsProperties): React.ReactElement {
  return (
    <div className="visualization-controls">
      <label>
        Order
        <select
          aria-label="Order"
          value={view.sort}
          onChange={(event) => { onChange({ ...view, sort: event.target.value as SortOrder }); }}
        >
          {ORDERS.map((order) => (
            <option key={order.value} value={order.value}>{order.label}</option>
          ))}
        </select>
      </label>
      <label>
        Show
        <select
          aria-label="Show"
          value={view.limit}
          onChange={(event) => { onChange({ ...view, limit: Number(event.target.value) }); }}
        >
          {CAPS.map((cap) => (
            <option key={cap} value={cap}>{cap === 0 ? 'All' : `Top ${cap}`}</option>
          ))}
        </select>
      </label>
      <label>
        Only
        <select
          aria-label="Only"
          value={view.focus ?? ''}
          onChange={(event) => {
            const next = event.target.value;
            onChange({ ...view, ...(next === '' ? { focus: undefined } : { focus: next }) });
          }}
        >
          <option value="">Every category</option>
          {labels.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
      </label>
      {view.sort === DEFAULT_VIEW.sort && view.limit === DEFAULT_VIEW.limit && view.focus === undefined
        ? null
        : (
          <button type="button" onClick={() => { onChange(DEFAULT_VIEW); }}>
            Reset
          </button>
        )}
    </div>
  );
}
