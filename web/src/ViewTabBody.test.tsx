import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import React from 'react';
import { ViewTabBody } from './ViewTabBody';
import type { TabView } from '@shared/protocol';

// jsdom doesn't include ResizeObserver — the notifications view's Transcript observes its content.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// MarkdownTab fetches its content on mount; stub fetch so that state update settles
// synchronously with the assertions instead of firing after the test has finished.
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  text: () => Promise.resolve('# Hello'),
} as unknown as Response));

function baseTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'test', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff',
    busy: false, hasUnread: false, cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false,
    ...overrides,
  };
}

describe('ViewTabBody', () => {
  it('returns null for an agent tab with no special view', () => {
    const tab = baseTab({ view: undefined });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.innerHTML).toBe('');
  });

  it('returns null when view is image but no image payload', () => {
    const tab = baseTab({ view: 'image' });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.innerHTML).toBe('');
  });

  it('returns null when view is page (page tabs are rendered by MountedViewLayers)', () => {
    const tab = baseTab({ view: 'page', page: { url: 'https://example.com', domain: 'example.com', number: 1 } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.innerHTML).toBe('');
  });

  it('returns null when view is markdown but no markdown payload', () => {
    const tab = baseTab({ view: 'markdown' });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.innerHTML).toBe('');
  });

  it('returns null when view is files but no files payload', () => {
    const tab = baseTab({ view: 'files' });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.innerHTML).toBe('');
  });

  it('renders ImageTab when view is image with payload', () => {
    const tab = baseTab({ view: 'image', image: { name: 'test.png', path: '/a/test.png', size: '1 KB', url: '/open/1' } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('renders MarkdownTab when view is markdown with payload', async () => {
    const tab = baseTab({ view: 'markdown', markdown: { name: 'readme.md', path: '/a/readme.md', size: '2 KB', url: '/open/2' } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
    await waitFor(() => screen.getByRole('heading', { level: 1 }));
  });

  it('renders FileNavigatorTab when view is files with payload', () => {
    const tab = baseTab({ view: 'files', files: { root: '/', absoluteRoot: '/', rows: [] } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('renders a notifications tab as a transcript with no command bar', () => {
    const tab = baseTab({ view: 'notifications', bufferLines: [{ type: 'output', text: 'a notification' }] });
    const { container, getByText } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
    expect(container.querySelector('.transcript')).toBeTruthy();
    expect(getByText('a notification')).toBeTruthy();
    expect(container.querySelector('textarea')).toBeNull();
  });
});
