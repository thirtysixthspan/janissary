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
    notices: [],
    instructions: [],
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

  // The composer claims the same history recall an agent tab's has, and it had none: `history: []` made
  // the recall return immediately, so ArrowUp did nothing at all and a user who had asked this
  // visualization several things had to retype them. A live-update turn carries no query and is skipped
  // rather than recalled as an empty string.
  // A notice is a measurement rather than something the model said, and it is the only text in the tab
  // that is not part of the exchange — which is why it is set apart from it and why it names its chart.
  // A rule the user cannot see is a rule they cannot check, so it is on the screen rather than only in a
  // prompt. It is set apart from the exchange because it came from neither side of it.
  // The affordance, and the case it must not appear in: a turn that only answered a question offers a
  // button that does nothing beside a label claiming something happened.
  // The question and the readings it is answered with. It is the suggestion row with the question above it,
  // because it is the same shape of interaction, and a reading needs nothing new to be sent.
  it('asks the question the model could not answer, and sends a reading as an ordinary message', () => {
    show(payload({ clarify: { question: 'Which region do you mean?', options: ['north', 'south'] } }));
    expect(screen.getByText('Which region do you mean?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'south' }));
    expect(CAPABILITIES.intent).toHaveBeenCalledWith('send', { query: 'south' });
  });

  it('asks nothing when there is no question outstanding', () => {
    expect(show(payload()).container.querySelector('.visualization-clarify')).toBeNull();
  });

  it('offers to take back a turn that changed the charts, and says what it changed', () => {
    show(payload({ turns: [turn({ undo: 'removed "Revenue by region"' })] }));
    const button = screen.getByRole('button', { name: /Undo — it removed/u });
    fireEvent.click(button);
    expect(CAPABILITIES.intent).toHaveBeenCalledWith('undo', { query: 'plot revenue by region' });
  });

  it('offers nothing to take back on a turn that changed nothing', () => {
    const rendered = show(payload({ turns: [turn()] }));
    expect(rendered.container.querySelector('.visualization-undo')).toBeNull();
  });

  it('shows the rules the user asked to be kept', () => {
    show(payload({ instructions: ['always split by service'] }));
    const rule = screen.getByText(/always split by service/u);
    expect(rule.className).toBe('visualization-rule');
    expect(rule.textContent).toContain('Always:');
  });

  it('shows no rules at all when there are none', () => {
    expect(show(payload()).container.querySelector('.visualization-rules')).toBeNull();
  });

  it('shows what the host noticed in the data, above the exchange', () => {
    show(payload({
      notices: ['In "Latency", north has a latency of 4200, outside the 98 to 103 that the middle half of the other 9 latency values occupies.'],
      turns: [turn()],
    }));
    const notice = screen.getByText(/north has a latency of 4200/u);
    expect(notice.className).toBe('visualization-notice');
  });

  it('shows no findings region at all when there is nothing to report', () => {
    expect(show(payload()).container.querySelector('.visualization-notices')).toBeNull();
  });

  it('recalls the conversation\'s own earlier queries on ArrowUp', () => {
    show(payload({
      turns: [
        turn({ query: 'first question' }),
        turn({ query: 'second question' }),
        turn({ query: '', response: '' }),
      ],
    }));
    const input = screen.getByLabelText('Ask about the data or the chart') as HTMLTextAreaElement;

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('second question');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('first question');
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
