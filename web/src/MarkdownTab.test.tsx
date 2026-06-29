import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarkdownView } from '@shared/protocol';
import { MarkdownTab } from './MarkdownTab';

function makeMarkdown(overrides: Partial<MarkdownView> = {}): MarkdownView {
  return {
    name: 'README.md',
    path: '/home/user/README.md',
    size: '2.1 KB',
    url: '/open/1',
    ...overrides,
  };
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
    text: () => Promise.resolve('# Hello\n\nSome **bold** text.'),
  } as unknown as Response));
});

describe('MarkdownTab', () => {
  it('renders the file metadata header', () => {
    render(<MarkdownTab markdown={makeMarkdown()} />);
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('2.1 KB')).toBeInTheDocument();
    expect(screen.getByText('/home/user/README.md')).toBeInTheDocument();
  });

  it('renders markdown content as HTML after fetch', async () => {
    render(<MarkdownTab markdown={makeMarkdown()} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hello');
  });

  it('ArrowDown increases scrollTop', async () => {
    const { container } = render(<MarkdownTab markdown={makeMarkdown()} />);
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    const stage = container.querySelector('.markdown-stage')! as HTMLElement;
    stage.scrollTop = 0;
    fireKey('ArrowDown');
    expect(stage.scrollTop).toBeGreaterThan(0);
  });

  it('ArrowUp decreases scrollTop', async () => {
    const { container } = render(<MarkdownTab markdown={makeMarkdown()} />);
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    const stage = container.querySelector('.markdown-stage')! as HTMLElement;
    stage.scrollTop = 100;
    fireKey('ArrowUp');
    expect(stage.scrollTop).toBeLessThan(100);
  });

  it('PageDown increases scrollTop', async () => {
    const { container } = render(<MarkdownTab markdown={makeMarkdown()} />);
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    const stage = container.querySelector('.markdown-stage')! as HTMLElement;
    stage.scrollTop = 0;
    Object.defineProperty(stage, 'clientHeight', { value: 500, configurable: true });
    fireKey('PageDown');
    expect(stage.scrollTop).toBe(500);
  });

  it('ArrowDown/Up call preventDefault', async () => {
    render(<MarkdownTab markdown={makeMarkdown()} />);
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    expect(fireKey('ArrowDown').defaultPrevented).toBe(true);
    expect(fireKey('ArrowUp').defaultPrevented).toBe(true);
  });

  it('PageUp/PageDown call preventDefault', async () => {
    render(<MarkdownTab markdown={makeMarkdown()} />);
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
    expect(fireKey('PageUp').defaultPrevented).toBe(true);
    expect(fireKey('PageDown').defaultPrevented).toBe(true);
  });
});
