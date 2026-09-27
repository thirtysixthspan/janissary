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

// A drawn tab, which is the only state that carries the composer, the export controls, and the row of
// follow-up suggestions.
function withIntent(over: Partial<VisualizationWindow> = {}) {
  const { intent, value } = capabilities();
  render(<VisualizationTab
    payload={{
      kind: 'visualization',
      window: view({ table: TABLE, chart: CHART, ...over }),
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

  // A bar whose height is a sum reads as a raw value to anyone not told otherwise, and the caption is
  // the one place they are told without opening anything.
  it('says how the measure was reduced, and says nothing when it was not', () => {
    tab({ table: TABLE, chart: { ...CHART, aggregate: 'sum' } });
    expect(screen.getByText('2 rows · sum of revenue')).toBeInTheDocument();
  });

  it('leaves the caption alone for a chart with no aggregate', () => {
    tab({ table: TABLE, chart: CHART });
    expect(screen.getByText('2 rows')).toBeInTheDocument();
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

  // The promise the spec and the pull request description both make: a source that stops answering
  // does not take the chart off the screen. The manager already keeps the table, so this is the half
  // that was not holding.
  it('keeps the chart on screen when a re-read has failed, with the reason above it', () => {
    const { container } = tab({
      table: TABLE, chart: CHART, error: 'https://example.com/d.csv returned 500',
    });
    expect(container.querySelector('svg.visualization-chart')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/d.csv returned 500')).toBeInTheDocument();
  });

  it('shows the reason on its own when the failure left no table to keep a chart from', () => {
    const { container } = tab({ error: 'https://example.com/d.csv returned 404' });
    expect(container.querySelector('svg.visualization-chart')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change the source' })).toBeInTheDocument();
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

  // A chart is a picture, and a screen reader told only its title has been told nothing about the data.
  // The label has to resolve to real elements inside the element it labels, which is why this reads the
  // ids back off the attribute rather than searching for a title by text.
  it('names the chart and describes its content for a screen reader', () => {
    const { container } = tab({ table: TABLE, chart: CHART });
    const svg = container.querySelector('svg.visualization-chart')!;
    expect(svg).toHaveAttribute('role', 'img');
    const labelledBy = svg.getAttribute('aria-labelledby')!;
    const [titleId, descriptionId] = labelledBy.split(' ');
    const byId = (id: string): Element | null => document.querySelector(`[id="${CSS.escape(id)}"]`);
    expect(byId(titleId!)?.textContent).toBe('Revenue by region');
    expect(byId(descriptionId!)?.textContent)
      .toBe('A bar chart of revenue over north to south: 2 marks, from 4 at south to 10 at north.');
  });

  it('offers the drawn marks as a table, reachable one keystroke away', () => {
    tab({ table: TABLE, chart: CHART });
    const disclosure = screen.getByText('Data table');
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['region', 'revenue']);
    for (const header of headers) expect(header).toHaveAttribute('scope', 'col');
    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['north', '10', 'south', '4']);
  });

  // A re-read that fails keeps the chart, and the table is part of the chart rather than an extra that a
  // failure is allowed to cost the user.
  it('keeps the data table when a re-read has failed', () => {
    tab({ table: TABLE, chart: CHART, error: 'https://example.com/d.csv returned 500' });
    expect(screen.getByText('Data table')).toBeInTheDocument();
  });

  // Every answer to a follow-up about a chart costs a model call, so the tab can narrow one itself. The
  // property that matters is that the picture, the table beside it, and the caption all narrow together.
  describe('follow-up suggestions', () => {
    it('offers none before there is a chart to ask about', () => {
      tab({ table: TABLE, questions: [], pendingQuestionId: undefined });
      expect(screen.queryByRole('button', { name: 'split by region' })).toBeNull();
    });

    it('offers the model follow-ups as one-click modifications', () => {
      tab({ table: TABLE, chart: CHART, followUps: ['split by region', 'make it a line'] });
      expect(screen.getByRole('button', { name: 'split by region' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'make it a line' })).toBeInTheDocument();
    });

    // The whole reason they exist: a follow-up costs no model call to phrase and no wait to send.
    it('sends a suggestion as the query, rather than filling the field', () => {
      const intent = withIntent({ followUps: ['split by region'] });
      fireEvent.click(screen.getByRole('button', { name: 'split by region' }));
      expect(intent).toHaveBeenCalledWith('revise', { query: 'split by region' });
    });

    it('shows no row for a chart the model offered nothing about', () => {
      tab({ table: TABLE, chart: CHART });
      expect(screen.queryByRole('button', { name: 'split by region' })).toBeNull();
    });

    // A button that does nothing while the model works is worse than no button.
    it('hides the row while a reply is in flight', () => {
      tab({ table: TABLE, chart: CHART, followUps: ['split by region'], busy: true });
      expect(screen.queryByRole('button', { name: 'split by region' })).toBeNull();
    });
  });

  describe('narrowing a chart', () => {
    // Six regions, so the smallest cap the control offers can actually narrow something: a cap of five
    // over three rows is a no-op, which is the right behaviour and a useless fixture.
    const WIDE: VisualizationTable = {
      columns: [
        { name: 'region', type: 'string' },
        { name: 'revenue', type: 'number' },
      ],
      rows: [
        ['north', 10], ['south', 4], ['east', 7], ['west', 6], ['pole', 3], ['isles', 9],
      ],
      total: 6,
      truncated: false,
    };

    function cells(): string[] {
      return screen.getAllByRole('cell').map((cell) => cell.textContent ?? '');
    }

    function narrow(over: Partial<VisualizationWindow> = {}) {
      return tab({ table: WIDE, chart: CHART, ...over });
    }

    it('offers the three ways of looking closer only once there is a chart', () => {
      const { unmount } = tab({ table: TABLE });
      expect(screen.queryByLabelText('Order')).toBeNull();
      unmount();
      narrow();
      expect(screen.getByLabelText('Order')).toBeInTheDocument();
      expect(screen.getByLabelText('Show')).toBeInTheDocument();
      expect(screen.getByLabelText('Only')).toBeInTheDocument();
    });

    it('offers every category as a filter, not only the ones it has kept', () => {
      narrow();
      const options = [...(screen.getByLabelText('Only') as HTMLSelectElement).querySelectorAll('option')]
        .map((option) => option.textContent);
      expect(options).toEqual(['Every category', 'north', 'south', 'east', 'west', 'pole', 'isles']);
    });

    it('reorders the table when the order changes, without asking anyone', () => {
      narrow();
      expect(cells().slice(0, 2)).toEqual(['north', '10']);
      fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'value' } });
      // Largest first: north 10, isles 9, east 7, west 6, south 4, pole 3.
      expect(cells()).toEqual([
        'north', '10', 'isles', '9', 'east', '7', 'west', '6', 'south', '4', 'pole', '3',
      ]);
    });

    it('narrows the table to the categories it keeps, and says which it dropped', () => {
      narrow();
      fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'value' } });
      fireEvent.change(screen.getByLabelText('Show'), { target: { value: '5' } });
      expect(screen.getByText('6 rows · top 5 of 6')).toBeInTheDocument();
      expect(cells()).toEqual(['north', '10', 'isles', '9', 'east', '7', 'west', '6', 'south', '4']);
    });

    it('narrows the table to one category, and says which', () => {
      narrow();
      fireEvent.change(screen.getByLabelText('Only'), { target: { value: 'east' } });
      expect(screen.getByText('6 rows · only east')).toBeInTheDocument();
      expect(cells()).toEqual(['east', '7']);
    });

    it('puts the order, the cap, and the filter back the way they were', () => {
      narrow();
      fireEvent.change(screen.getByLabelText('Only'), { target: { value: 'east' } });
      expect(screen.getByText('6 rows · only east')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByText('6 rows')).toBeInTheDocument();
      expect(cells()).toHaveLength(12);
      expect(cells().slice(0, 2)).toEqual(['north', '10']);
    });

    it('says nothing about narrowing until something is narrowed', () => {
      narrow();
      expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    });
  });
});
