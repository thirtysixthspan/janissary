import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarkdownPayload } from '@shared/plugins/markdown/shared';
import type { TabPluginClientCapabilities } from '../api';
import { MarkdownTab } from './MarkdownTab';

function makeMarkdown(overrides: Partial<MarkdownPayload> = {}): MarkdownPayload {
  return {
    name: 'README.md',
    path: '/home/user/README.md',
    size: '2.1 KB',
    url: '/open/1',
    ...overrides,
  };
}

function makeCapabilities(
  { active = true, onSplit }: { active?: boolean; onSplit?: () => void } = {},
): TabPluginClientCapabilities {
  return {
    resourceUrl: (reference) => `${reference}?token=`,
    intent: async <Result,>() => ({}) as Result,
    splitAction: onSplit
      ? <button type="button" className="tab-split" onClick={onSplit}>Split</button>
      : null,
    active,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
}

function renderTab(options: { active?: boolean; onSplit?: () => void; markdown?: MarkdownPayload } = {}) {
  return render(
    <MarkdownTab payload={options.markdown ?? makeMarkdown()} capabilities={makeCapabilities(options)} />,
  );
}

function fireKey(key: string) {
  let event!: KeyboardEvent;
  act(() => {
    event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('# Hello\n\nSome **bold** text.'),
  } as unknown as Response));
});

describe('MarkdownTab', () => {
  it('renders the file metadata header', async () => {
    renderTab();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('2.1 KB')).toBeInTheDocument();
    expect(screen.getByText('/home/user/README.md')).toBeInTheDocument();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
  });

  it('fetches the file through the host-supplied resource url', async () => {
    renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    expect(fetch).toHaveBeenCalledWith('/open/1?token=');
  });

  it('offers Split and ignores global keys while its pane is inactive', async () => {
    const onSplit = vi.fn();
    const { container } = renderTab({ active: false, onSplit });
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalledOnce();
    const stage = container.querySelector('.markdown-stage') as HTMLElement;
    stage.scrollTop = 0;
    expect(fireKey('ArrowDown').defaultPrevented).toBe(false);
    expect(stage.scrollTop).toBe(0);
  });

  it('places Split in the right-side metadata actions', async () => {
    const { container } = renderTab({ onSplit: () => {} });
    await waitFor(() => screen.getByRole('heading', { level: 1 }));

    expect(container.querySelector(':scope .plugin-actions .tab-split')).not.toBeNull();
  });

  it('renders no actions when the host supplies no split control', async () => {
    const { container } = renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));

    expect(container.querySelector(':scope .plugin-actions')).toBeNull();
  });

  it('renders markdown content as HTML after fetch', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hello');
  });

  it('falls back to a failure line when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderTab();
    await waitFor(() => expect(screen.getByText('Failed to load README.md')).toBeInTheDocument());
  });

  it('falls back to a failure line when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('# Not found'),
    } as unknown as Response));

    renderTab();

    await waitFor(() => expect(screen.getByText('Failed to load README.md')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Not found' })).not.toBeInTheDocument();
  });

  it('ArrowDown increases scrollTop', async () => {
    const { container } = renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    const stage = container.querySelector('.markdown-stage')! as HTMLElement;
    stage.scrollTop = 0;
    fireKey('ArrowDown');
    expect(stage.scrollTop).toBeGreaterThan(0);
  });

  it('ArrowUp decreases scrollTop', async () => {
    const { container } = renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    const stage = container.querySelector('.markdown-stage')! as HTMLElement;
    stage.scrollTop = 100;
    fireKey('ArrowUp');
    expect(stage.scrollTop).toBeLessThan(100);
  });

  it('PageDown increases scrollTop', async () => {
    const { container } = renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    const stage = container.querySelector('.markdown-stage')! as HTMLElement;
    stage.scrollTop = 0;
    Object.defineProperty(stage, 'clientHeight', { value: 500, configurable: true });
    fireKey('PageDown');
    expect(stage.scrollTop).toBe(500);
  });

  it('ArrowDown/Up call preventDefault', async () => {
    renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    expect(fireKey('ArrowDown').defaultPrevented).toBe(true);
    expect(fireKey('ArrowUp').defaultPrevented).toBe(true);
  });

  it('PageUp/PageDown call preventDefault', async () => {
    renderTab();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    expect(fireKey('PageUp').defaultPrevented).toBe(true);
    expect(fireKey('PageDown').defaultPrevented).toBe(true);
  });
});
