import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchMatch, SearchPayload } from '@shared/plugins/search/shared';
import type { TabPluginClientCapabilities } from '../api';
import { SearchTab } from './SearchTab';

function match(overrides: Partial<SearchMatch> = {}): SearchMatch {
  return {
    path: 'src/a.ts', line: 12, above: ['one', 'two'],
    match: '  // todo: fix', below: ['three', 'four'],
    ...overrides,
  };
}

function payload(overrides: Partial<SearchPayload> = {}): SearchPayload {
  return {
    query: 'todo', include: '', exclude: '',
    regex: false, matchCase: false, wholeWord: false,
    state: 'done', message: '', rows: [match()], ...overrides,
  };
}

function makeCapabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    splitAction: null, active: true, dock: null,
    close: vi.fn(), reportFailure: vi.fn(),
  };
  return { capabilities, intent };
}

const renderTab = (value: SearchPayload = payload()) => {
  const { capabilities, intent } = makeCapabilities();
  const rendered = render(<SearchTab payload={value} capabilities={capabilities} />);
  return { ...rendered, intent };
};

const searches = (intent: ReturnType<typeof vi.fn>) =>
  intent.mock.calls.filter(([name]) => name === 'search').map(([, sent]) => sent);

// The shared list selection scrolls the highlighted row into view, which jsdom does not implement.
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });

describe('SearchTab', () => {
  it('shows the query the search ran', () => {
    renderTab();
    expect((screen.getByLabelText('Search the project') as HTMLTextAreaElement).value).toBe('todo');
  });

  it('shows a row per match with its path and line in the header', () => {
    const { container } = renderTab();
    expect(container.querySelectorAll('.search-row-header')).toHaveLength(1);
    expect(container.querySelector('.search-row-path')?.textContent).toBe('src/a.ts');
    expect(container.querySelector('.search-row-line')?.textContent).toBe('12');
  });

  it('shows the context lines either side of the match', () => {
    const { container } = renderTab();
    const lines = [...container.querySelectorAll('.search-text')].map((el) => el.textContent);
    expect(lines).toEqual(['one', 'two', '  // todo: fix', 'three', 'four']);
  });

  it('labels each context line with the line number it sits on', () => {
    const { container } = renderTab();
    const numbers = [...container.querySelectorAll('.search-lineno')].map((el) => el.textContent);
    expect(numbers).toEqual(['10', '11', '12', '13', '14']);
  });

  it('highlights the matching line and not the context', () => {
    const { container } = renderTab();
    expect(container.querySelectorAll('.search-hit')).toHaveLength(1);
    expect(container.querySelectorAll('.search-context')).toHaveLength(4);
  });

  it('carries the three mode toggles in the header and nothing else', () => {
    renderTab();
    expect(screen.getByLabelText('Regular expression')).toBeDefined();
    expect(screen.getByLabelText('Match case')).toBeDefined();
    expect(screen.getByLabelText('Whole word')).toBeDefined();
  });

  it('shows no match count anywhere', () => {
    const { container } = renderTab();
    expect(container.textContent).not.toMatch(/\d+ matches?/u);
  });

  it('runs a search with a mode toggled on', () => {
    const { intent } = renderTab();
    fireEvent.click(screen.getByLabelText('Regular expression'));
    expect(searches(intent)).toEqual([
      { query: 'todo', include: '', exclude: '', regex: true, matchCase: false, wholeWord: false },
    ]);
  });

  it('runs a search with a mode toggled off again', () => {
    const { intent } = renderTab(payload({ regex: true }));
    fireEvent.click(screen.getByLabelText('Regular expression'));
    expect(searches(intent).at(-1)).toMatchObject({ regex: false });
  });

  it('reflects a toggled mode as pressed', () => {
    renderTab();
    const toggle = screen.getByLabelText('Match case');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Match case').getAttribute('aria-pressed')).toBe('true');
  });

  it('runs a search narrowed by the include field, carrying the value just typed', () => {
    const { intent } = renderTab();
    fireEvent.change(screen.getByLabelText('Files to include'), { target: { value: 'src/**' } });
    expect(searches(intent).at(-1)).toMatchObject({ include: 'src/**' });
  });

  it('runs a search narrowed by the exclude field', () => {
    const { intent } = renderTab();
    fireEvent.change(screen.getByLabelText('Files to exclude'), { target: { value: '*.test.ts' } });
    expect(searches(intent).at(-1)).toMatchObject({ exclude: '*.test.ts' });
  });

  it('opens the selected match on Enter', () => {
    const { container, intent } = renderTab();
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'src/a.ts', line: 12 });
  });

  it('opens a match on a single click', () => {
    const { container, intent } = renderTab();
    fireEvent.click(container.querySelector('.search-row')!);
    expect(intent).toHaveBeenCalledWith('open', { path: 'src/a.ts', line: 12 });
  });

  it('opens the row the arrows moved to, not the first', () => {
    const { container, intent } = renderTab(payload({
      rows: [match({ path: 'a.ts', line: 1 }), match({ path: 'b.ts', line: 2 })],
    }));
    const results = container.querySelector('.search-results')!;
    fireEvent.keyDown(results, { key: 'ArrowDown' });
    fireEvent.keyDown(results, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'b.ts', line: 2 });
  });

  it('marks the selected row', () => {
    const { container } = renderTab(payload({
      rows: [match({ path: 'a.ts', line: 1 }), match({ path: 'b.ts', line: 2 })],
    }));
    const results = container.querySelector('.search-results')!;
    fireEvent.keyDown(results, { key: 'ArrowDown' });
    expect(results.querySelectorAll('.search-row.selected')).toHaveLength(1);
    expect(results.querySelectorAll('.search-row')[1]?.className).toContain('selected');
  });

  it('moves the selection with Home and End', () => {
    const { container, intent } = renderTab(payload({
      rows: [match({ path: 'a.ts', line: 1 }), match({ path: 'b.ts', line: 2 }), match({ path: 'c.ts', line: 3 })],
    }));
    const results = container.querySelector('.search-results')!;
    fireEvent.keyDown(results, { key: 'End' });
    fireEvent.keyDown(results, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'c.ts', line: 3 });
    fireEvent.keyDown(results, { key: 'Home' });
    fireEvent.keyDown(results, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'a.ts', line: 1 });
  });

  it('leaves the arrow keys in the search bar to the bar', () => {
    const { intent } = renderTab();
    const bar = screen.getByLabelText('Search the project');
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.anything());
  });

  it('does not move the selection as streaming rows arrive beneath it', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container, rerender } = render(<SearchTab payload={payload()} capabilities={capabilities} />);
    fireEvent.click(container.querySelector('.search-row')!);
    expect((container.querySelector('.search-row.selected') as HTMLElement).dataset.index).toBe('0');
    // Rows stream in while a scan runs. The highlighted row must stay the one the user picked, so
    // opening it after a batch lands still opens the same match.
    rerender(
      <SearchTab
        payload={payload({ rows: [match(), match({ path: 'b.ts', line: 40 }), match({ path: 'c.ts', line: 9 })] })}
        capabilities={capabilities}
      />,
    );
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'src/a.ts', line: 12 });
  });

  it('says it is searching while a scan runs', () => {
    renderTab(payload({ state: 'searching', rows: [] }));
    expect(screen.getByText('Searching…')).toBeDefined();
  });

  it('keeps the rows it has while a scan is still running', () => {
    renderTab(payload({ state: 'searching' }));
    expect(screen.getByText('src/a.ts')).toBeDefined();
    expect(screen.getByText('Searching…')).toBeDefined();
  });

  it('reports that a query matched nothing', () => {
    renderTab(payload({ rows: [], state: 'done' }));
    expect(screen.getByText('No matches found for "todo".')).toBeDefined();
  });

  it('prompts for a query when there is none', () => {
    renderTab(payload({ query: '', rows: [], state: 'done' }));
    expect(screen.getByText('Type to search')).toBeDefined();
  });

  it('shows the reason a scan failed', () => {
    renderTab(payload({ rows: [], state: 'error', message: 'Could not list the project' }));
    expect(screen.getByText('Could not list the project')).toBeDefined();
  });

  it('opens nothing on Enter when no rows have arrived', () => {
    const { container, intent } = renderTab(payload({ rows: [], state: 'searching' }));
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'End' });
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'Enter' });
    expect(intent).not.toHaveBeenCalled();
  });

  it('keeps the selection on the only row when End is pressed on a single row', () => {
    const { container, intent } = renderTab();
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'End' });
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { path: 'src/a.ts', line: 12 });
  });
});
