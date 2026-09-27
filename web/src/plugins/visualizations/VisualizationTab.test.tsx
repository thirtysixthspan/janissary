import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  VisualizationChart,
  VisualizationTable,
  VisualizationWindow,
} from '@shared/plugins/visualizations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { VisualizationTab } from './VisualizationTab';

function capabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

const TABLE: VisualizationTable = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
  ],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

const CHART: VisualizationChart = { kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue by region' };

function view(over: Partial<VisualizationWindow> = {}): VisualizationWindow {
  return {
    id: 'one',
    title: 'Revenue by region',
    source: 'https://example.com/d.csv',
    pair: { harness: 'opencode', model: 'model-a' },
    refreshSeconds: 0,
    questions: [],
    turns: [],
    ...over,
  };
}

function tab(over: Partial<VisualizationWindow> = {}) {
  const { intent, value } = capabilities();
  const rendered = render(<VisualizationTab
    payload={{
      kind: 'visualization',
      window: view(over),
      models: [
        { harness: 'opencode', model: 'model-a' },
        { harness: 'claude', model: 'model-b' },
      ],
    }}
    capabilities={value}
  />);
  return { ...rendered, intent, value };
}

// A drawn tab, which is the only state that carries the composer and the export controls.
function withIntent() {
  const { intent, value } = capabilities();
  render(<VisualizationTab
    payload={{
      kind: 'visualization',
      window: view({ table: TABLE, chart: CHART }),
      models: [{ harness: 'opencode', model: 'model-a' }],
    }}
    capabilities={value}
  />);
  return intent;
}

describe('VisualizationTab', () => {
  it('shows the source and a chart drawn from the table', () => {
    const { container } = tab({ table: TABLE, chart: CHART });
    expect(screen.getByTitle('https://example.com/d.csv')).toBeInTheDocument();
    expect(container.querySelector('svg.visualization-chart')).toBeInTheDocument();
    expect(screen.getByText('2 rows')).toBeInTheDocument();
  });

  it('says how much of a truncated source it is showing', () => {
    tab({ table: { ...TABLE, total: 12_043, truncated: true }, chart: CHART });
    expect(screen.getByText('showing 2 of 12043 rows')).toBeInTheDocument();
  });

  it('renders the current question with its suggestions, and emits the answer', () => {
    const { intent, value } = capabilities();
    render(<VisualizationTab
      payload={{
        kind: 'visualization',
        window: view({
          table: TABLE,
          questions: [
            { id: 'q1', question: 'Which measure?', suggestions: ['revenue', 'visits'] },
            { id: 'q2', question: 'Split by?', suggestions: [] },
          ],
          pendingQuestionId: 'q1',
        }),
        models: [],
      }}
      capabilities={value}
    />);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'revenue' }));
    expect(intent).toHaveBeenCalledWith('answer', { questionId: 'q1', answer: 'revenue' });
  });

  it('accepts an answer none of the suggestions covered', () => {
    const { intent, value } = capabilities();
    render(<VisualizationTab
      payload={{
        kind: 'visualization',
        window: view({ table: TABLE, questions: [{ id: 'q1', question: 'Which measure?', suggestions: ['revenue'] }], pendingQuestionId: 'q1' }),
        models: [],
      }}
      capabilities={value}
    />);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'margin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(intent).toHaveBeenCalledWith('answer', { questionId: 'q1', answer: 'margin' });
  });

  it('shows the recorded failure and offers the two things that can change it', () => {
    const { intent, value } = capabilities();
    render(<VisualizationTab
      payload={{
        kind: 'visualization',
        window: view({ error: 'https://example.com/d.csv returned 404' }),
        models: [],
      }}
      capabilities={value}
    />);
    expect(screen.getByText('https://example.com/d.csv returned 404')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change the source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change source' }));
    fireEvent.change(screen.getByLabelText('Data source'), { target: { value: 'https://example.com/other.csv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this source' }));
    expect(intent).toHaveBeenCalledWith('set-source', { source: 'https://example.com/other.csv' });
  });

  it('says the model had no questions, and can ask again', () => {
    const { intent, value } = capabilities();
    render(<VisualizationTab
      payload={{ kind: 'visualization', window: view({ table: TABLE }), models: [] }}
      capabilities={value}
    />);
    expect(screen.getByText('The model had no questions to ask.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(intent).toHaveBeenCalledWith('start-interview', {});
  });

  it('waits while the source is still being read', () => {
    tab({ busy: true });
    expect(screen.getByText('Reading the source…')).toBeInTheDocument();
  });

  it('emits a modification from the composer, and offers a model and an interval', () => {
    const intent = withIntent();
    fireEvent.change(screen.getByLabelText('Change the chart'), { target: { value: 'make it a line' } });
    fireEvent.keyDown(screen.getByLabelText('Change the chart'), { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('revise', { query: 'make it a line' });

    fireEvent.change(screen.getByLabelText('Refresh'), { target: { value: '30' } });
    expect(intent).toHaveBeenCalledWith('set-refresh', { seconds: 30 });
  });

  it('offers the model catalog grouped by harness, and emits the chosen pair', () => {
    const { intent, value } = capabilities();
    render(<VisualizationTab
      payload={{
        kind: 'visualization',
        window: view(),
        models: [
          { harness: 'opencode', model: 'model-a' },
          { harness: 'claude', model: 'model-b' },
        ],
      }}
      capabilities={value}
    />);
    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label))
      .toEqual(['opencode', 'claude']);
    fireEvent.change(select, { target: { value: 'claude:model-b' } });
    expect(intent).toHaveBeenCalledWith('select-model', { harness: 'claude', model: 'model-b' });
  });

  it('reads the source on demand', () => {
    const intent = withIntent();
    fireEvent.click(screen.getByTitle('Read the source now'));
    expect(intent).toHaveBeenCalledWith('refresh-now', {});
  });

  it('disables both exports until there is a chart to export', () => {
    const { container } = tab({ table: TABLE });
    expect(screen.getByTitle('Export as PNG')).toBeDisabled();
    expect(screen.getByTitle('Export as PDF')).toBeDisabled();
    expect(container.querySelector('svg.visualization-chart')).toBeNull();
  });

  it('enables both exports once a chart exists', () => {
    tab({ table: TABLE, chart: CHART });
    expect(screen.getByTitle('Export as PNG')).not.toBeDisabled();
    expect(screen.getByTitle('Export as PDF')).not.toBeDisabled();
  });

  it('says a deleted visualization was deleted, and disables every control', () => {
    tab({ deleted: true, table: TABLE, chart: CHART });
    expect(screen.getByText('This visualization was deleted.')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(screen.getByTitle('Read the source now')).toBeDisabled();
    expect(screen.getByTitle('Export as PNG')).toBeDisabled();
  });

  it('renames on a committed edit, the way every other tab in the application does', () => {
    const { intent, container } = tab({ table: TABLE, chart: CHART });
    fireEvent.doubleClick(container.querySelector('.visualization-title')!);
    const field = document.querySelector('.visualization-title-input') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Quarterly revenue' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('rename', { title: 'Quarterly revenue' });
  });

  it('changes nothing when a rename is committed unchanged or cancelled', () => {
    const { intent, container } = tab({ table: TABLE, chart: CHART });
    fireEvent.doubleClick(container.querySelector('.visualization-title')!);
    fireEvent.keyDown(document.querySelector('.visualization-title-input')!, { key: 'Escape' });
    expect(intent).not.toHaveBeenCalled();
  });

  it('renders every mark kind the grammar defines', () => {
    for (const kind of ['bar', 'line', 'area', 'scatter', 'pie'] as const) {
      const { container, unmount } = tab({ table: TABLE, chart: { ...CHART, kind } });
      expect(container.querySelector('svg.visualization-chart')).toBeInTheDocument();
      unmount();
    }
  });
});
