import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VisualizationTab } from './VisualizationTab';
import type {
  VisualizationChart,
  VisualizationTabPayload,
  VisualizationTurn,
  VisualizationWindow,
} from '@shared/plugins/visualizations/shared';

const CAPABILITIES = {
  resourceUrl: (reference: string) => reference,
  intent: vi.fn(),
  splitAction: null,
  active: true,
  reportFailure: vi.fn(),
  dock: null,
  close: vi.fn(),
};

function table(over: Partial<VisualizationChart['table']> = {}): VisualizationChart['table'] {
  return {
    columns: [
      { name: 'region', type: 'string' },
      { name: 'revenue', type: 'number' },
    ],
    rows: [['north', 10], ['south', 4]],
    total: 2,
    truncated: false,
    ...over,
  };
}

function chart(over: Partial<VisualizationChart> = {}): VisualizationChart {
  return {
    id: 'chart-1',
    data: { kind: 'source' },
    notes: [],
    refreshSeconds: 0,
    table: table(),
    kind: 'bar',
    x: 'region',
    y: 'revenue',
    title: 'Revenue by region',
    ...over,
  };
}

function turn(over: Partial<VisualizationTurn> = {}): VisualizationTurn {
  return { query: 'plot revenue by region', response: 'Here it is.', pair: { harness: 'claude', model: 'opus' }, ...over };
}

function windowOf(over: Partial<VisualizationWindow> = {}): VisualizationWindow {
  return {
    id: 'v1',
    title: 'Revenue by region',
    source: 'https://example.com/sales.csv',
    pair: { harness: 'claude', model: 'opus' },
    charts: [],
    turns: [],
    ...over,
  };
}

function payload(over: Partial<VisualizationWindow> = {}): VisualizationTabPayload {
  return { kind: 'visualization', window: windowOf(over), models: [{ harness: 'claude', model: 'opus' }] };
}

function show(value: VisualizationTabPayload) {
  return render(<VisualizationTab payload={value} capabilities={CAPABILITIES} />);
}

beforeEach(() => {
  CAPABILITIES.intent.mockReset();
  cleanup();
});

describe('a new visualization tab', () => {
  it('opens as a conversation with nothing in it but the prompt', () => {
    show(payload({ source: '' }));
    expect(screen.getByText(/Paste the URL of a data file/u)).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.querySelectorAll('select')).toHaveLength(0);
  });

  it('names the source it was given', () => {
    show(payload());
    expect(screen.getByText('https://example.com/sales.csv')).toBeDefined();
    expect(screen.getByText('Revenue by region')).toBeDefined();
  });

  it('has no dropdown and no tab-level control beyond the host split action', () => {
    show(payload({ charts: [chart()], turns: [turn()] }));
    expect(document.querySelectorAll('select')).toHaveLength(0);
    // The only buttons are the chart's own four and the composer.
    expect(document.querySelectorAll('.visualization-card-actions button')).toHaveLength(4);
  });

  it('sends what was typed, and keeps the text when a reply is in flight', () => {
    show(payload());
    const input = screen.getByLabelText('Ask about the data or the chart');
    fireEvent.change(input, { target: { value: 'only 2024' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(CAPABILITIES.intent).toHaveBeenCalledWith('send', { query: 'only 2024' });

    cleanup();
    CAPABILITIES.intent.mockReset();
    show(payload({ busy: true }));
    const held = screen.getByLabelText('Ask about the data or the chart') as HTMLTextAreaElement;
    fireEvent.change(held, { target: { value: 'and a line chart' } });
    fireEvent.keyDown(held, { key: 'Enter' });
    expect(CAPABILITIES.intent).not.toHaveBeenCalled();
    expect(held.value).toBe('and a line chart');
  });

  // The whole of the tab while a reply is in flight, and the payload carrying it: Enter is refused
  // rather than silently dropped by the server, the typed text stays where it is, and the one thing
  // that still works is the one that stops the reply.
  it('refuses a message and offers a cancel while the window is busy', () => {
    show(payload({
      busy: true,
      turns: [turn({ response: '', streaming: true })],
    }));
    const input = screen.getByLabelText('Ask about the data or the chart') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'and a line chart' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(CAPABILITIES.intent).not.toHaveBeenCalled();
    expect(input.value).toBe('and a line chart');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(CAPABILITIES.intent).toHaveBeenCalledWith('cancel', {});
  });

  it('cancels a reply with Escape', () => {
    show(payload({ busy: true }));
    fireEvent.keyDown(screen.getByLabelText('Ask about the data or the chart'), { key: 'Escape' });
    expect(CAPABILITIES.intent).toHaveBeenCalledWith('cancel', {});
  });

  it('clears an unsent message with Escape', () => {
    show(payload());
    const input = screen.getByLabelText('Ask about the data or the chart') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'half typed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('sends a suggestion as the user\'s own words', () => {
    show(payload({ charts: [chart()], followUps: ['make it a line chart', 'split by year'] }));
    fireEvent.click(screen.getByRole('button', { name: 'make it a line chart' }));
    expect(CAPABILITIES.intent).toHaveBeenCalledWith('send', { query: 'make it a line chart' });
  });

  it('renders the exchange oldest first, with the reply as sanitized markdown', () => {
    show(payload({
      turns: [turn({ query: 'first', response: '**one**' }), turn({ query: 'second', response: 'two' })],
    }));
    const queries = screen.getAllByText(/^(first|second)$/u).map((node) => node.textContent);
    expect(queries).toEqual(['first', 'second']);
    expect(screen.getByText('one').tagName).toBe('STRONG');
  });

  it('shows a failure above the composer', () => {
    show(payload({ error: 'https://example.com/sales.csv returned 500' }));
    expect(screen.getByText('https://example.com/sales.csv returned 500')).toBeDefined();
  });

  it('disables the composer and says so once the visualization is deleted', () => {
    show(payload({ deleted: true, charts: [chart()] }));
    expect(screen.getByText('This visualization was deleted.')).toBeDefined();
    expect((screen.getByLabelText('Ask about the data or the chart') as HTMLTextAreaElement).disabled).toBe(true);
  });
});

describe('the charts', () => {
  it('renders one card per chart', () => {
    show(payload({ charts: [chart(), chart({ id: 'chart-2', title: 'Revenue by year' })] }));
    // The name is in the chart`s own <title> as well as in its heading, which is what a screen reader
    // is given, so the assertion is that it appears rather than that it appears once.
    expect(screen.getAllByText('Revenue by year').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.visualization-card')).toHaveLength(2);
  });

  it('draws each of the five kinds', () => {
    for (const kind of ['bar', 'line', 'area', 'scatter', 'pie'] as const) {
      show(payload({ charts: [chart({ kind })] }));
      expect(document.querySelector('.visualization-chart')).not.toBeNull();
      cleanup();
    }
  });

  it('shows no chart region at all before there is a chart', () => {
    show(payload());
    expect(document.querySelectorAll('.visualization-card')).toHaveLength(0);
  });

  it('leaves a chart on screen with the reason above it when a read failed', () => {
    show(payload({ charts: [chart()], error: 'the source stopped answering' }));
    expect(screen.getByText('the source stopped answering')).toBeDefined();
    expect(document.querySelectorAll('.visualization-card')).toHaveLength(1);
  });
});
