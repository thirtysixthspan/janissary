import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPayload } from '@shared/plugins/pdf/shared';
import type { TabPluginClientCapabilities } from '../api';
import { loadPdf, type LoadedPdf } from './pdf-document';
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

function makeDocument(pages = 3): LoadedPdf {
  return {
    pageSizes: Array.from({ length: pages }, () => ({ width: 600, height: 800 })),
    renderPage: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
}

function capabilities(): TabPluginClientCapabilities {
  return {
    resourceUrl: (reference: string) => reference,
    intent: vi.fn(async () => null),
    splitAction: <button type="button" aria-label="Split" />,
    active: true,
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

async function mount(document_: LoadedPdf | null = makeDocument(), client = capabilities()) {
  load.mockResolvedValue(
    document_ ? { ok: true, document: document_ } : { ok: false, reason: 'password-protected' },
  );
  const view = render(<PdfTab payload={payload} capabilities={client} />);
  if (document_) await screen.findByLabelText('Show pages');
  return view;
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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PdfTab header', () => {
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
    render(<PdfTab payload={payload} capabilities={capabilities()} />);
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
    vi.mocked(document_.renderPage).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const client = capabilities();
    const view = await mount(document_, client);
    onScreen({ 0: 1 });
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
