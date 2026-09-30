import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// The shared list selection scrolls the highlighted row into view, which jsdom does not implement —
// so the call has to be absorbed. A spy rather than a bare stub, because which row the window scrolls
// is part of what this tab promises, and a discarded mock cannot be asked about it. jsdom has no
// `scrollIntoView` of its own, so the no-op it is spied over is installed here.
Element.prototype.scrollIntoView ??= () => {};
const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

beforeEach(() => { scrollIntoView.mockClear(); });

const renderTab = (value: SearchPayload = payload()) => {
  const { capabilities, intent } = makeCapabilities();
  const rendered = render(<SearchTab payload={value} capabilities={capabilities} />);
  return { ...rendered, intent };
};

// The `data-index` of every row the window was asked to bring into view, in order.
const scrollIndexes = () => scrollIntoView.mock.instances.map(
  (element) => (element as HTMLElement).dataset?.index,
);

// The row the window was last asked to bring into view.
const lastScrolled = () => scrollIndexes().at(-1);

const searches = (intent: ReturnType<typeof vi.fn>) =>
  intent.mock.calls.filter(([name]) => name === 'search').map(([, sent]) => sent);

// How long a typed term rests before it becomes a search, from the bar's own debounce. Longer than
// the real one so a test that advances by this is never racing it.
const SETTLED_MS = 250;

const searchTerm = () => screen.getByLabelText('Search the project') as HTMLTextAreaElement;

// Type a term and let it rest, which is the one moment a term joins the history.
const settle = (text: string) => {
  fireEvent.change(searchTerm(), { target: { value: text } });
  act(() => { vi.advanceTimersByTime(SETTLED_MS); });
};

const press = (key: string) => { fireEvent.keyDown(searchTerm(), { key }); };

describe('SearchTab history', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('walks back through the terms searched with the up arrow', () => {
    renderTab();
    // The tab opened having searched `todo`, and `fixme` was searched after it.
    settle('fixme');
    press('ArrowUp');
    expect(searchTerm().value).toBe('fixme');
    press('ArrowUp');
    expect(searchTerm().value).toBe('todo');
  });

  it('stops at the oldest term rather than wrapping past it', () => {
    renderTab();
    settle('fixme');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(searchTerm().value).toBe('todo');
  });

  it('walks forward again and hands back the draft the walk started from', () => {
    renderTab();
    settle('fixme');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowDown');
    expect(searchTerm().value).toBe('fixme');
    // Past the newest entry the walk is over, and the term the user was typing comes back rather
    // than the list cycling.
    press('ArrowDown');
    expect(searchTerm().value).toBe('fixme');
  });

  it('records a term re-searched once, so the walk never stops on two copies of it', () => {
    const { intent } = renderTab(payload({ query: '' }));
    settle('todo');
    settle('fixme');
    settle('todo');
    expect(searches(intent).map((sent: { query: string }) => sent.query)).toEqual(['todo', 'fixme', 'todo']);
    // `todo` searched again is the newest entry, and the copy from the first search is gone rather
    // than left where it was: the walk runs todo, fixme, and then stops — a third `todo` at the
    // far end would be the duplicate this rule exists to prevent.
    press('ArrowUp');
    expect(searchTerm().value).toBe('todo');
    press('ArrowUp');
    expect(searchTerm().value).toBe('fixme');
    press('ArrowUp');
    expect(searchTerm().value).toBe('fixme');
  });

  it('starts a tab opened by a phrase with that phrase already walkable', () => {
    renderTab(payload({ query: 'compileMatcher' }));
    settle('compileMismatcher');
    press('ArrowUp');
    press('ArrowUp');
    expect(searchTerm().value).toBe('compileMatcher');
  });

  it('leaves the term where it is when there is nothing to walk', () => {
    renderTab(payload({ query: '', rows: [] }));
    // An empty list must be a no-op rather than a throw or a cleared field — a tab that has never
    // searched anything is exactly the state a freshly opened one is in.
    press('ArrowUp');
    expect(searchTerm().value).toBe('');
    press('ArrowDown');
    expect(searchTerm().value).toBe('');
  });

  it('does not record a term when a mode or a filter reruns the one already in the bar', () => {
    renderTab();
    settle('fixme');
    fireEvent.click(screen.getByLabelText('Match case'));
    fireEvent.change(screen.getByLabelText('Files to exclude'), { target: { value: '*.md' } });
    // Both reran `fixme`, and a rerun is not a new term: recording it would only shuffle the list so
    // that ArrowUp answered with a search the user did not just make.
    press('ArrowUp');
    expect(searchTerm().value).toBe('fixme');
    press('ArrowUp');
    expect(searchTerm().value).toBe('todo');
  });

  it('completes a partly typed term from the one list it walks', () => {
    const { container } = renderTab();
    settle('compileMatcher');
    fireEvent.change(searchTerm(), { target: { value: 'compile' } });
    // The ghost is derived from the same list inside the shared hook, so a term already searched
    // trails the text being typed — and the walk and the suggestion cannot disagree.
    expect(container.querySelector('.ghost')?.textContent).toBe('compileMatcher');
  });
});

describe('SearchTab', () => {
  it('shows the query the search ran', () => {
    renderTab();
    expect((screen.getByLabelText('Search the project') as HTMLTextAreaElement).value).toBe('todo');
  });

  it('puts the command bar last, at the bottom edge like every other command bar', () => {
    const { container } = renderTab();
    const tab = container.querySelector('.search-tab')!;
    // The agent tab renders its metadata row, then its body, then the bar last, so the prompt is
    // always at the bottom edge under whatever the tab is showing. The bar is the tab's last child
    // and the result window the one before it, for the same reason.
    expect(tab.lastElementChild?.querySelector('.command')).not.toBeNull();
    expect(tab.lastElementChild?.previousElementSibling?.className).toBe('search-results');
  });

  it('labels the command line so the prompt says what the line is', () => {
    const { container } = renderTab();
    // `search >`, through the shell's own label slot rather than markup of the plugin's own, so the
    // label and the glyph cannot drift apart.
    expect(container.querySelector('.command')).toHaveTextContent('search');
  });

  it('emits the rows in the order the scan produced them', () => {
    const { container } = renderTab(payload({
      rows: [match({ path: 'a.ts', line: 1 }), match({ path: 'b.ts', line: 2 })],
    }));
    // The window is a reversed column, so the first row the scan produced is the one at the bottom.
    // Shuffling the array would read bottom-up as the reverse of what the scan found.
    const paths = [...container.querySelectorAll('.search-row-path')].map((el) => el.textContent);
    expect(paths).toEqual(['a.ts', 'b.ts']);
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

  it('wraps each side of the match in its own bounded context block', () => {
    const { container } = renderTab();
    const above = container.querySelector('.search-context-above')!;
    const below = container.querySelector('.search-context-below')!;
    // The two sides are separate blocks because they are bounded separately, and each is clipped at
    // the end furthest from the match — so the block above the match, then the match, then the one
    // below, with each side's lines still reading top to bottom as the file does.
    expect(above.nextElementSibling?.className).toBe('search-line search-hit');
    expect(above.previousElementSibling?.className).toBe('search-row-header');
    expect(below.previousElementSibling?.className).toBe('search-line search-hit');
    expect([...above.querySelectorAll('.search-text')].map((el) => el.textContent))
      .toEqual(['one', 'two']);
    expect([...below.querySelectorAll('.search-text')].map((el) => el.textContent))
      .toEqual(['three', 'four']);
  });

  it('carries the three mode toggles on the command line, beside the query they read', () => {
    const { container } = renderTab();
    const command = container.querySelector('.command')!;
    expect(command.querySelector(':scope button[aria-label="Regular expression"]')).not.toBeNull();
    expect(command.querySelector(':scope button[aria-label="Match case"]')).not.toBeNull();
    expect(command.querySelector(':scope button[aria-label="Whole word"]')).not.toBeNull();
    // The command line, not the metadata bar a row above it: a control that governs what the query
    // means belongs where the query is typed.
    expect(container.querySelector('.plugin-meta :scope button')).toBeNull();
  });

  it('carries the narrowing fields in the metadata bar, beside the tab actions', () => {
    const { container } = renderTab(payload());
    const meta = container.querySelector('.plugin-meta')!;
    // The fields choose which files the query runs against rather than what the query says, so they
    // sit with the tab's settings, and they share the line with the actions that stay right-aligned.
    expect(meta.querySelector(':scope input[aria-label="Files to include"]')).not.toBeNull();
    expect(meta.querySelector(':scope input[aria-label="Files to exclude"]')).not.toBeNull();
    expect(container.querySelector('.command :scope input')).toBeNull();
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

  it('opens a match on a single click and leaves that row highlighted', () => {
    const { container, intent } = renderTab(payload({
      rows: [match({ path: 'a.ts', line: 1 }), match({ path: 'b.ts', line: 2 })],
    }));
    const rows = container.querySelectorAll('.search-row');
    fireEvent.click(rows[1]!);
    // The selection is what the shared list selection performs — including focusing the list — so
    // opening and highlighting are one click rather than two independent steps.
    expect(intent).toHaveBeenCalledWith('open', { path: 'b.ts', line: 2 });
    expect(container.querySelectorAll('.search-row.selected')).toHaveLength(1);
    expect((container.querySelectorAll('.search-row')[1] as HTMLElement).className).toContain('selected');
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

  it('steps from the search bar to the results on Tab', () => {
    const { container } = renderTab();
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    results.focus();
    // Without this the bar — the tab's last focusable child — hands Tab straight out of the tab,
    // since nothing in the DOM after it is focusable.
    fireEvent.keyDown(screen.getByLabelText('Search the project'), { key: 'Tab' });
    expect(results).toHaveFocus();
  });

  it('steps from the results back to the search bar on Tab', () => {
    const { container } = renderTab();
    const bar = screen.getByLabelText('Search the project');
    container.querySelector<HTMLDivElement>('.search-results')!.focus();
    fireEvent.keyDown(container.querySelector('.search-results')!, { key: 'Tab' });
    expect(bar).toHaveFocus();
  });

  it('leaves Shift+Tab to the browser so it walks backwards out of the tab', () => {
    const { container } = renderTab();
    const bar = screen.getByLabelText('Search the project');
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    // Shift+Tab is what a user presses to leave, so neither handler claims it and the focus stays
    // put rather than folding the two elements into a loop the user cannot exit.
    bar.focus();
    fireEvent.keyDown(bar, { key: 'Tab', shiftKey: true });
    expect(bar).toHaveFocus();
    results.focus();
    fireEvent.keyDown(results, { key: 'Tab', shiftKey: true });
    expect(results).toHaveFocus();
  });

  it('offers the window and the bar as the tab’s only two focusable elements, window first', () => {
    const { container } = renderTab();
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    // The order the two handlers agree with: Tab walks forward from the window to the bar, and the
    // window is one stop in its own right however many rows it holds — the rows take -1, so the
    // arrows move a selection rather than walking a tab stop per match.
    expect(results.getAttribute('tabindex')).toBe('0');
    expect(container.querySelectorAll('.search-row[tabindex="0"]')).toHaveLength(0);
    expect(container.querySelectorAll('.search-row[tabindex="-1"]')).toHaveLength(1);
    expect(results.compareDocumentPosition(container.querySelector('.command')!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

// A window that stacks upward puts row 0 at the bottom edge, so "the row the arrows moved to" is the
// entry the scan found Nth, not the Nth one on screen. Every case below is about the window being
// told to bring one particular row into view, and about it being left alone when nothing moved.
describe('SearchTab result scrolling', () => {
  const threeRows = () => payload({
    rows: [match({ path: 'a.ts', line: 1 }), match({ path: 'b.ts', line: 2 }), match({ path: 'c.ts', line: 3 })],
  });

  it('brings the first result into view when the tab opens on one', () => {
    renderTab();
    // The selection starts on the first match, which is the entry at the bottom edge — so this is
    // the scroll that puts the thing the search found first under the reader's eye.
    expect(scrollIndexes()).toEqual(['0']);
  });

  it('scrolls the row each arrow moves to, and only that row', () => {
    const { container } = renderTab(threeRows());
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    scrollIntoView.mockClear();
    fireEvent.keyDown(results, { key: 'ArrowDown' });
    expect(scrollIndexes()).toEqual(['1']);
    fireEvent.keyDown(results, { key: 'ArrowDown' });
    expect(scrollIndexes()).toEqual(['1', '2']);
    fireEvent.keyDown(results, { key: 'ArrowUp' });
    expect(scrollIndexes()).toEqual(['1', '2', '1']);
    // Row 0 is the bottom of the window, so walking back to the start of the list is a scroll to the
    // bottom edge and not to the top of the list.
    fireEvent.keyDown(results, { key: 'Home' });
    expect(lastScrolled()).toBe('0');
  });

  it('scrolls to the last result for End and back to the first for Home', () => {
    const { container } = renderTab(threeRows());
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    scrollIntoView.mockClear();
    fireEvent.keyDown(results, { key: 'End' });
    expect(lastScrolled()).toBe('2');
    fireEvent.keyDown(results, { key: 'Home' });
    expect(lastScrolled()).toBe('0');
  });

  it('scrolls as little as it must rather than centring the row', () => {
    const { container } = renderTab(threeRows());
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    scrollIntoView.mockClear();
    fireEvent.keyDown(results, { key: 'ArrowDown' });
    // `nearest` moves the window the minimum distance to show the row, so stepping down a long list
    // does not jump it on every key.
    expect(scrollIntoView.mock.calls.at(-1)?.[0]).toEqual({ block: 'nearest' });
  });

  it('neither scrolls nor moves the highlight when a streaming batch lands', () => {
    const { capabilities } = makeCapabilities();
    const { container, rerender } = render(<SearchTab payload={threeRows()} capabilities={capabilities} />);
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    results.focus();
    fireEvent.keyDown(results, { key: 'End' });
    scrollIntoView.mockClear();
    rerender(
      <SearchTab
        payload={payload({ rows: [...threeRows().rows, match({ path: 'd.ts', line: 4 })] })}
        capabilities={capabilities}
      />,
    );
    // A scroll fired by an arriving row would drag the window away from the bottom edge, which is
    // where the first match is, and the highlight the user had chosen would move with it.
    expect(scrollIndexes()).toEqual([]);
    expect(results.querySelectorAll('.search-row.selected')).toHaveLength(1);
  });

  it('does not scroll again when Enter opens the row that is already in view', () => {
    const { container } = renderTab(threeRows());
    const results = container.querySelector<HTMLDivElement>('.search-results')!;
    results.focus();
    fireEvent.keyDown(results, { key: 'ArrowDown' });
    scrollIntoView.mockClear();
    fireEvent.keyDown(results, { key: 'Enter' });
    // The selection did not move, so there is nothing new to bring into view.
    expect(scrollIndexes()).toEqual([]);
  });
});
