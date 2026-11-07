import React from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { PdfPayload } from '@shared/plugins/pdf/shared';
import type { TabPluginClientCapabilities } from '../api';
import { createPluginChordRegistry, PluginChordProvider, type PluginChordRegistry } from '../PluginChords';
import { loadPdf, type LoadedPdf } from './pdf-document';
import { PDF_FIND_CURRENT, PDF_FIND_MATCH } from './pdf-find-marks';
import type { PdfTextItem } from './pdf-find-lines';
import { PdfTab } from './PdfTab';

// Two stubs make this run. `pdf-document.ts` is mocked, which is exactly what that module exists to
// make sufficient; and `IntersectionObserver` is stubbed on the jsdom global, which does not
// implement it — the test drives its callback to say which pages are on screen, which is also how
// the position readout and the highlighted thumbnail are exercised, since both read from it.
const cancelled = vi.hoisted(() => new Error('render cancelled'));
vi.mock('./pdf-document', () => ({
  loadPdf: vi.fn(),
  isRenderCancellation: (error: unknown) => error === cancelled,
}));

const load = vi.mocked(loadPdf);

type Watcher = { callback: IntersectionObserverCallback; elements: Element[] };
let watchers: Watcher[] = [];
let resizeWatchers: { callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];

const payload: PdfPayload = {
  name: 'paper.pdf', path: '/docs/paper.pdf', size: '1.2 MB', url: '/open/ref-1',
};

function makeDocument(pages = 3, pageTexts: string[][] = []): LoadedPdf {
  return {
    pageSizes: Array.from({ length: pages }, () => ({ width: 600, height: 800 })),
    renderPage: vi.fn(async () => {}),
    readPageText: vi.fn(async (index: number) =>
      (pageTexts[index] ?? []).map((text) => ({ text, hasEOL: true, top: 0.5 }))),
    destroy: vi.fn(),
  };
}

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
};

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
  const promise = new Promise<Value>((res) => { resolve = res; });
  return { promise, resolve };
}

function capabilities(active = true): TabPluginClientCapabilities {
  return {
    resourceUrl: (reference: string) => reference,
    intent: vi.fn(async () => null),
    splitAction: <button type="button" aria-label="Split" />,
    active,
    label: 'pdf1',
    claimedChords: ['meta+f'],
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  } as unknown as TabPluginClientCapabilities;
}

// Say which pages are on screen, and how much of each. Every watcher that observed one of the named
// elements hears about it, exactly as a real browser reports to both the page's own observer and the
// stage's.
function onScreen(ratios: Record<number, number>, root = '.pdf-stage'): void {
  const entries = Object.entries(ratios).flatMap(([page, ratio]) => {
    const target = document.querySelector(`${root} .pdf-page[data-page="${CSS.escape(page)}"]`);
    return target ? [{ target, intersectionRatio: ratio, isIntersecting: ratio > 0 }] : [];
  });
  act(() => {
    for (const watcher of watchers) {
      const mine = entries.filter((entry) => watcher.elements.includes(entry.target));
      if (mine.length === 0) continue;
      watcher.callback(mine as unknown as IntersectionObserverEntry[], null as never);
    }
  });
}

function renderTab(chords: PluginChordRegistry, client = capabilities()) {
  return render(
    <PluginChordProvider registry={chords}>
      <PdfTab payload={payload} capabilities={client} />
    </PluginChordProvider>,
  );
}

async function mount(document_: LoadedPdf | null = makeDocument(), client = capabilities()) {
  load.mockResolvedValue(
    document_ ? { ok: true, document: document_ } : { ok: false, reason: 'password-protected' },
  );
  const chords = createPluginChordRegistry();
  const view = renderTab(chords, client);
  if (!document_) return { ...view, chords };
  await screen.findByLabelText('Show pages');
  // A page observes itself in an effect that can run after the header appears, and a notification
  // sent before then is lost, so wait until the stage's page is being watched.
  await waitFor(() => {
    expect(watchers.some((watcher) => watcher.elements.some((element) => element.matches('.pdf-stage .pdf-page')))).toBe(true);
  });
  return { ...view, chords };
}

function findInput(): HTMLInputElement {
  return screen.getByLabelText('Search document') as HTMLInputElement;
}

function findRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.editor-find-row')];
}

function runFindChord(chords: PluginChordRegistry): boolean {
  let claimed = false;
  act(() => { claimed = chords.run('meta+f', 'pdf1'); });
  return claimed;
}

function openFind(chords: PluginChordRegistry): HTMLInputElement {
  expect(runFindChord(chords)).toBe(true);
  return findInput();
}

async function finishReading(): Promise<void> {
  await waitFor(() => { expect(screen.queryByText('Reading pages…')).not.toBeInTheDocument(); });
}

function stubHighlights(): Map<string, Set<Range>> {
  const highlights = new Map<string, Set<Range>>();
  vi.stubGlobal('CSS', { escape: CSS.escape, highlights });
  vi.stubGlobal('Highlight', class extends Set<Range> {});
  return highlights;
}

function markRanges(highlights: Map<string, Set<Range>>, name: string): Range[] {
  return [...highlights.get(name) ?? []];
}

function allRanges(highlights: Map<string, Set<Range>>): Range[] {
  return [...markRanges(highlights, PDF_FIND_MATCH), ...markRanges(highlights, PDF_FIND_CURRENT)];
}

function markedDocument(pageTexts: string[][]): LoadedPdf {
  const document_ = makeDocument(pageTexts.length, pageTexts);
  vi.mocked(document_.renderPage).mockImplementation(async (index, _canvas, _scale, textLayer) => {
    if (textLayer === null) return;
    textLayer.replaceChildren();
    const lines = pageTexts[index] ?? [];
    for (const line of lines) {
      const span = document.createElement('span');
      span.textContent = line;
      textLayer.append(span, document.createElement('br'));
    }
  });
  return document_;
}

beforeEach(() => {
  watchers = [];
  resizeWatchers = [];
  load.mockReset();
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) {
      resizeWatchers.push({ callback, observe: this.observe, disconnect: this.disconnect });
    }
  });
  vi.stubGlobal('IntersectionObserver', class {
    private readonly watcher: Watcher;
    constructor(callback: IntersectionObserverCallback) {
      this.watcher = { callback, elements: [] };
      watchers.push(this.watcher);
    }

    observe(element: Element) { this.watcher.elements.push(element); }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  });
  // jsdom implements no scrolling at all, so the jump target has to exist before the stage reaches
  // for it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PdfTab header', () => {
  it('keeps browser observers available until automatic teardown disposes the document', async () => {
    const document_ = makeDocument();
    const intersectionObserver = globalThis.IntersectionObserver;
    const resizeObserver = globalThis.ResizeObserver;
    const disposed = vi.fn();
    vi.mocked(document_.destroy).mockImplementation(() => {
      disposed(globalThis.IntersectionObserver, globalThis.ResizeObserver);
    });
    onTestFinished(() => {
      expect(disposed).toHaveBeenCalledExactlyOnceWith(intersectionObserver, resizeObserver);
    });

    await mount(document_);

    expect(disposed).not.toHaveBeenCalled();
  });

  it('shows the file, the position, the controls, and the host split action', async () => {
    await mount();

    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.2 MB')).toBeInTheDocument();
    expect(screen.getByText('/docs/paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Show pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Continuous scroll')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByLabelText('Split')).toBeInTheDocument();
  });
});

describe('PdfTab layout toggle', () => {
  it('lists one page in single-page layout and every page in continuous', async () => {
    const { container } = await mount();
    expect(container.querySelectorAll('.pdf-page')).toHaveLength(1);

    await userEvent.click(screen.getByLabelText('Continuous scroll'));

    expect(container.querySelectorAll('.pdf-page')).toHaveLength(3);
    expect(container.querySelector('.pdf-stage')).toHaveClass('pdf-continuous');
    expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('names what the click will do rather than the current layout', async () => {
    await mount();

    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    expect(screen.getByLabelText('Single page')).toBeInTheDocument();
    expect(screen.queryByLabelText('Continuous scroll')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Single page'));
    expect(screen.getByLabelText('Continuous scroll')).toBeInTheDocument();
  });
});

describe('PdfTab thumbnail strip', () => {
  it('navigates with header buttons and disables document boundaries', async () => {
    await mount();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('disables both page buttons for a one-page document', async () => {
    await mount(makeDocument(1));
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('starts hidden and names what its toggle will do', async () => {
    const { container } = await mount();
    expect(container.querySelector('.pdf-thumbnails')).toBeNull();

    await userEvent.click(screen.getByLabelText('Show pages'));
    expect(container.querySelector('.pdf-thumbnails')).not.toBeNull();
    expect(screen.getByLabelText('Hide pages')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Hide pages'));
    expect(container.querySelector('.pdf-thumbnails')).toBeNull();
    expect(screen.getByLabelText('Show pages')).toBeInTheDocument();
  });

  it('changes the shown page when a thumbnail is clicked', async () => {
    const { container } = await mount();
    await userEvent.click(screen.getByLabelText('Show pages'));
    const strip = container.querySelector('.pdf-thumbnails');

    await userEvent.click(within(strip as HTMLElement).getByLabelText('Page 3'));

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByLabelText('Page 3')).toHaveClass('pdf-thumbnail-current');
  });
});

describe('PdfTab selectable text', () => {
  it('builds the text layer under the plugin\'s own class', async () => {
    const { container } = await mount();

    expect(container.querySelector(':scope .pdf-page .pdf-text-layer')).not.toBeNull();
    expect(container.querySelector('.textLayer')).toBeNull();
  });
});

describe('PdfTab find', () => {
  it('opens over the document with the claimed chord', async () => {
    const { chords } = await mount(makeDocument(2, [['alpha'], ['beta']]));

    const input = openFind(chords);

    expect(input).toHaveAttribute('placeholder', 'Search document');
    expect(input).toHaveAttribute('aria-label', 'Search document');
  });

  it('focuses and selects the query on a second claimed chord', async () => {
    const document_ = makeDocument(2, [['alpha'], ['beta']]);
    const { chords } = await mount(document_);
    const input = openFind(chords);
    await userEvent.type(input, 'alpha');
    await finishReading();
    input.blur();

    act(() => { chords.run('meta+f', 'pdf1'); });

    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('alpha');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('alpha'.length);
    expect(vi.mocked(document_.readPageText)).toHaveBeenCalledTimes(2);
  });

  it('claims the chord without opening while the document is loading', async () => {
    load.mockReturnValue(new Promise<never>(() => {}));
    const chords = createPluginChordRegistry();
    renderTab(chords);
    await screen.findByText('paper.pdf');

    expect(runFindChord(chords)).toBe(true);
    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();
  });

  it('claims the chord without opening after a failed load', async () => {
    load.mockResolvedValue({ ok: false, reason: 'password-protected' });
    const chords = createPluginChordRegistry();
    renderTab(chords);
    await screen.findByText('Failed to load paper.pdf');

    expect(runFindChord(chords)).toBe(true);
    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();
  });

  it('lists page-numbered rows', async () => {
    const { chords } = await mount(makeDocument(2, [['needle first'], ['needle second']]));
    const input = openFind(chords);

    await userEvent.type(input, 'needle');
    await finishReading();

    const labels = findRows().map((row) => row.querySelector('.editor-find-line')?.textContent);
    expect(findRows()).toHaveLength(2);
    expect(new Set(labels)).toEqual(new Set(['1', '2']));
  });

  it('shows the reading status until the last page is read', async () => {
    const first = deferred<PdfTextItem[]>();
    const second = deferred<PdfTextItem[]>();
    const document_ = makeDocument(2);
    vi.mocked(document_.readPageText)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { chords } = await mount(document_);
    const input = openFind(chords);

    await userEvent.type(input, 'needle');
    expect(screen.getByText('Reading pages…')).toBeInTheDocument();
    expect(screen.queryByText('No matching lines')).not.toBeInTheDocument();

    await act(async () => { first.resolve([{ text: 'needle here', hasEOL: true, top: 0.5 }]); });
    expect(findRows()).toHaveLength(1);
    expect(screen.getByText('Reading pages…')).toBeInTheDocument();

    await act(async () => { second.resolve([{ text: 'needle there', hasEOL: true, top: 0.5 }]); });
    expect(findRows()).toHaveLength(2);
    expect(screen.queryByText('Reading pages…')).not.toBeInTheDocument();
  });

  it('shows the page of a highlighted match and updates the readout', async () => {
    const { chords } = await mount(makeDocument(3, [['alpha'], ['beta target'], ['gamma']]));
    const input = openFind(chords);
    await userEvent.type(input, 'target');
    await finishReading();

    await userEvent.click(findRows()[0]);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(document.querySelector('.pdf-page[data-page="1"]')).not.toBeNull();
  });

  it('moves to the first ranked match on Return and keeps the overlay open', async () => {
    const { chords } = await mount(makeDocument(2, [['needle first'], ['needle second']]));
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();

    await userEvent.keyboard('{ArrowDown}');
    expect(findRows()[1]).toHaveClass('selected');

    await userEvent.keyboard('{Enter}');

    expect(screen.getByLabelText('Search document')).toBeInTheDocument();
    expect(findRows()[0]).toHaveClass('selected');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('closes the overlay on Escape without resetting zoom', async () => {
    const { chords } = await mount(makeDocument(1, [['alpha']]));
    await userEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByText('110%')).toBeInTheDocument();
    openFind(chords);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();
    expect(screen.getByText('110%')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('110%')).not.toBeInTheDocument();
  });

  it('closes from outside the overlay without resetting zoom', async () => {
    const { chords } = await mount(makeDocument(1, [['alpha']]));
    await userEvent.click(screen.getByLabelText('Zoom in'));
    const input = openFind(chords);
    input.blur();
    screen.getByLabelText('Zoom out').focus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();
    expect(screen.getByText('110%')).toBeInTheDocument();
  });

  it('does not answer the chord while the tab is not visible', async () => {
    const { chords } = await mount(makeDocument(1), capabilities(false));

    expect(runFindChord(chords)).toBe(false);
    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();
  });

  it('closes on a tab switch and reopens empty', async () => {
    const client = capabilities();
    const { chords, rerender } = await mount(makeDocument(2, [['needle'], ['needle two']]), client);
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    expect(input.value).toBe('needle');

    rerender(
      <PluginChordProvider registry={chords}>
        <PdfTab payload={payload} capabilities={{ ...client, active: false }} />
      </PluginChordProvider>,
    );
    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();

    rerender(
      <PluginChordProvider registry={chords}>
        <PdfTab payload={payload} capabilities={client} />
      </PluginChordProvider>,
    );
    openFind(chords);

    expect(findInput().value).toBe('');
  });
});

describe('PdfTab find reveals', () => {
  function stubViewportRects() {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1000);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      // eslint-disable-next-line unicorn/no-this-outside-of-class -- a DOM method measures its own receiver.
      if (this.matches('.pdf-stage')) return rect(100, 1000);
      // eslint-disable-next-line unicorn/no-this-outside-of-class -- a DOM method measures its own receiver.
      if (this.matches('.pdf-page[data-page="1"]')) return rect(500, 800);
      return rect(0, 0);
    });
  }

  function rect(top: number, height: number): DOMRect {
    return {
      top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  it('puts a revealed line a quarter down a continuous stage', async () => {
    const { chords, container } = await mount(makeDocument(2, [['alpha'], ['needle']]));
    stubViewportRects();
    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    const stage = container.querySelector('.pdf-stage') as HTMLElement;
    stage.scrollTop = 0;

    await userEvent.keyboard('{Enter}');

    await waitFor(() => { expect(stage.scrollTop).toBe(550); });
  });

  it('lists the page and scrolls a revealed line in single-page layout', async () => {
    const { chords, container } = await mount(makeDocument(2, [['alpha'], ['needle']]));
    stubViewportRects();
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    const stage = container.querySelector('.pdf-stage') as HTMLElement;
    stage.scrollTop = 0;

    await userEvent.keyboard('{Enter}');

    await waitFor(() => { expect(container.querySelector('.pdf-page[data-page="1"]')).not.toBeNull(); });
    await waitFor(() => { expect(stage.scrollTop).toBe(550); });
  });

  it('scrolls to a thumbnail without an offset', async () => {
    const { container } = await mount(makeDocument(2));
    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    await userEvent.click(screen.getByLabelText('Show pages'));
    const strip = container.querySelector('.pdf-thumbnails') as HTMLElement;
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    await userEvent.click(within(strip).getByLabelText('Page 2'));

    await waitFor(() => { expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }); });
  });
});

describe('PdfTab find marks', () => {
  async function showPage(page: number): Promise<void> {
    await act(async () => { onScreen({ [page]: 1 }); });
  }

  it('marks the drawn page and moves the current mark to the clicked row', async () => {
    const document_ = markedDocument([['needle first', 'needle second']]);
    const highlights = stubHighlights();
    const { chords } = await mount(document_);
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();

    await showPage(0);
    await waitFor(() => {
      expect(markRanges(highlights, PDF_FIND_MATCH)).toHaveLength(1);
      expect(markRanges(highlights, PDF_FIND_CURRENT)).toHaveLength(1);
    });
    const layer = document.querySelector('.pdf-page[data-page="0"] .pdf-text-layer') as HTMLElement;
    expect(markRanges(highlights, PDF_FIND_CURRENT)[0]?.startContainer).toBe(layer.querySelector('span')?.firstChild);

    const second = findRows().find((row) => row.textContent?.includes('needle second'));
    if (!second) throw new Error('missing second row');
    await userEvent.click(second);

    await waitFor(() => { expect(markRanges(highlights, PDF_FIND_CURRENT)).toHaveLength(1); });
    const [current] = markRanges(highlights, PDF_FIND_CURRENT);
    expect(current?.startContainer).toBe(layer.querySelectorAll('span')[1]?.firstChild);
    expect(current?.startOffset).toBe(0);
    expect(markRanges(highlights, PDF_FIND_MATCH)).toHaveLength(1);
    expect(markRanges(highlights, PDF_FIND_MATCH)[0]?.startContainer).toBe(layer.querySelector('span')?.firstChild);
  });

  it('marks a page drawn after the query is typed', async () => {
    const document_ = markedDocument([['needle here']]);
    const highlights = stubHighlights();
    const { chords } = await mount(document_);
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    expect(allRanges(highlights)).toEqual([]);

    await showPage(0);

    await waitFor(() => { expect(allRanges(highlights)).toHaveLength(1); });
  });

  it('does not redraw a drawn page when the query changes', async () => {
    const document_ = markedDocument([['needle here']]);
    const highlights = stubHighlights();
    const { chords } = await mount(document_);
    const input = openFind(chords);
    await userEvent.type(input, 'need');
    await finishReading();
    await showPage(0);
    await waitFor(() => { expect(allRanges(highlights)).toHaveLength(1); });
    const calls = vi.mocked(document_.renderPage).mock.calls.length;

    await userEvent.type(input, 'l');

    await waitFor(() => { expect(allRanges(highlights).map((range) => range.toString())).toEqual(['needl']); });
    expect(document_.renderPage).toHaveBeenCalledTimes(calls);
  });

  it('repaints a zoomed page and drops the old ranges', async () => {
    const document_ = markedDocument([['needle here']]);
    const highlights = stubHighlights();
    const { chords } = await mount(document_);
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    await showPage(0);
    await waitFor(() => { expect(allRanges(highlights)).toHaveLength(1); });
    const previous = allRanges(highlights);
    const calls = vi.mocked(document_.renderPage).mock.calls.length;

    await userEvent.click(screen.getByLabelText('Zoom in'));

    await waitFor(() => {
      expect(vi.mocked(document_.renderPage).mock.calls.length).toBeGreaterThan(calls);
    });
    await waitFor(() => {
      const next = allRanges(highlights);
      expect(next).toHaveLength(1);
      expect(next.some((range) => previous.includes(range))).toBe(false);
    });
  });

  it('clears the marks when the overlay closes', async () => {
    const document_ = markedDocument([['needle here']]);
    const highlights = stubHighlights();
    const { chords } = await mount(document_);
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    await showPage(0);
    await waitFor(() => { expect(allRanges(highlights)).toHaveLength(1); });

    await userEvent.keyboard('{Escape}');

    await waitFor(() => { expect(allRanges(highlights)).toEqual([]); });
  });
});

describe('PdfTab while scrolling', () => {
  it('fits changed stage dimensions and ignores duplicate size notifications', async () => {
    let width = 632;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1000);
    const document_ = makeDocument();
    const view = await mount(document_);
    onScreen({ 0: 1 });
    const watcher = resizeWatchers[0];
    expect(watcher.observe).toHaveBeenCalledWith(view.container.querySelector('.pdf-stage'));
    expect(document_.renderPage).toHaveBeenLastCalledWith(0, expect.anything(), 1, expect.anything());
    width = 332;
    act(() => { watcher.callback([], null as never); });
    expect(document_.renderPage).toHaveBeenLastCalledWith(0, expect.anything(), 0.5, expect.anything());
    const calls = vi.mocked(document_.renderPage).mock.calls.length;
    act(() => { watcher.callback([], null as never); });
    expect(document_.renderPage).toHaveBeenCalledTimes(calls);
    width = 632;
    act(() => { watcher.callback([], null as never); });
    expect(document_.renderPage).toHaveBeenLastCalledWith(0, expect.anything(), 1, expect.anything());
    view.unmount();
    expect(watcher.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reads the position and the highlighted thumbnail from the observer', async () => {
    const { container } = await mount();
    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    await userEvent.click(screen.getByLabelText('Show pages'));

    onScreen({ 0: 0.2, 1: 0.9, 2: 0 });

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    const strip = container.querySelector('.pdf-thumbnails') as HTMLElement;
    expect(within(strip).getByLabelText('Page 2')).toHaveClass('pdf-thumbnail-current');
  });

  it('draws only the pages the observer says are on screen', async () => {
    const document_ = makeDocument();
    load.mockResolvedValue({ ok: true, document: document_ });
    renderTab(createPluginChordRegistry());
    await screen.findByLabelText('Continuous scroll');
    await userEvent.click(screen.getByLabelText('Continuous scroll'));

    expect(document_.renderPage).not.toHaveBeenCalled();

    onScreen({ 1: 1 });

    await waitFor(() => { expect(document_.renderPage).toHaveBeenCalledTimes(1); });
    expect(document_.renderPage).toHaveBeenCalledWith(1, expect.anything(), expect.any(Number), expect.anything());
  });
});

describe('PdfTab failure', () => {
  it('reports simultaneous stage failures once and retains metadata', async () => {
    const document_ = makeDocument();
    vi.mocked(document_.renderPage).mockRejectedValue(new Error('cannot render'));
    const client = capabilities();
    const { container } = await mount(document_, client);
    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    onScreen({ 0: 1, 1: 1 });
    expect(await screen.findByText('Failed to load paper.pdf')).toBeInTheDocument();
    expect(container.querySelector('.pdf-stage')).toBeNull();
    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.2 MB')).toBeInTheDocument();
    expect(screen.getByText('/docs/paper.pdf')).toBeInTheDocument();
    expect(client.intent).toHaveBeenCalledExactlyOnceWith('load-failed', { reason: 'other' });
  });

  it('ignores render cancellation', async () => {
    const document_ = makeDocument();
    vi.mocked(document_.renderPage).mockRejectedValue(cancelled);
    const client = capabilities();
    await mount(document_, client);
    await act(async () => { onScreen({ 0: 1 }); });
    expect(document_.renderPage).toHaveBeenCalled();
    expect(screen.queryByText('Failed to load paper.pdf')).not.toBeInTheDocument();
    expect(client.intent).not.toHaveBeenCalled();
  });

  it('ignores thumbnail-only failures', async () => {
    const document_ = makeDocument();
    vi.mocked(document_.renderPage).mockRejectedValue(new Error('thumbnail'));
    const client = capabilities();
    await mount(document_, client);
    await userEvent.click(screen.getByLabelText('Show pages'));
    await act(async () => { onScreen({ 0: 1 }, '.pdf-thumbnails'); });
    expect(document_.renderPage).toHaveBeenCalled();
    expect(screen.queryByText('Failed to load paper.pdf')).not.toBeInTheDocument();
    expect(client.intent).not.toHaveBeenCalled();
  });

  it.each(['close', 'zoom'])('ignores a late rejection after %s', async (change) => {
    const document_ = makeDocument();
    let reject!: (reason: Error) => void;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
    const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
    vi.mocked(document_.renderPage).mockImplementationOnce(() => pending);
    const client = capabilities();
    const view = await mount(document_, client);
    // Re-sent until the render is in flight: the page observes itself in an effect, so a single
    // notification can land before there is anything listening for it.
    await waitFor(() => {
      onScreen({ 0: 1 });
      expect(document_.renderPage).toHaveBeenCalled();
    });
    if (change === 'close') view.unmount();
    else await userEvent.click(screen.getByLabelText('Zoom in'));
    await act(async () => { reject(new Error('late')); });
    expect(client.intent).not.toHaveBeenCalled();
  });

  it('renders the failure in place of the stage and keeps the tab', async () => {
    const { container } = await mount(null);

    expect(await screen.findByText('Failed to load paper.pdf')).toBeInTheDocument();
    expect(container.querySelector('.pdf-stage')).toBeNull();
    expect(screen.getByText('/docs/paper.pdf')).toBeInTheDocument();
  });

  it('closes the find overlay and clears its marks when a render fails', async () => {
    const document_ = markedDocument([['needle here'], ['another page']]);
    const highlights = stubHighlights();
    const { chords } = await mount(document_);
    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    const input = openFind(chords);
    await userEvent.type(input, 'needle');
    await finishReading();
    await act(async () => { onScreen({ 0: 1 }); });
    await waitFor(() => { expect(allRanges(highlights)).toHaveLength(1); });

    vi.mocked(document_.renderPage).mockRejectedValue(new Error('cannot render'));
    await act(async () => { onScreen({ 1: 1 }); });

    expect(await screen.findByText('Failed to load paper.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search document')).not.toBeInTheDocument();
    await waitFor(() => { expect(allRanges(highlights)).toEqual([]); });
  });
});

describe('a second PdfTab', () => {
  it('opens in single-page layout with the strip hidden whatever the first was switched to', async () => {
    const first = await mount();
    await userEvent.click(screen.getByLabelText('Continuous scroll'));
    await userEvent.click(screen.getByLabelText('Show pages'));
    first.unmount();

    const { container } = await mount();

    expect(container.querySelectorAll('.pdf-page')).toHaveLength(1);
    expect(container.querySelector('.pdf-thumbnails')).toBeNull();
    expect(screen.getByLabelText('Continuous scroll')).toBeInTheDocument();
    expect(screen.getByLabelText('Show pages')).toBeInTheDocument();
  });
});
