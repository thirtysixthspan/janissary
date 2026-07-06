import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ViewTabBody } from './ViewTabBody';
import type { TabView } from '@shared/protocol';

function baseTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'test', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff',
    busy: false, hasUnread: false, cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [],
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

  it('returns null when view is page but no page payload', () => {
    const tab = baseTab({ view: 'page' });
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

  it('renders PageTab when view is page with payload', () => {
    const tab = baseTab({ view: 'page', page: { url: 'https://example.com', domain: 'example.com', number: 1 } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('renders MarkdownTab when view is markdown with payload', () => {
    const tab = baseTab({ view: 'markdown', markdown: { name: 'readme.md', path: '/a/readme.md', size: '2 KB', url: '/open/2' } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('renders FileTreeTab when view is files with payload', () => {
    const tab = baseTab({ view: 'files', files: { root: '/', rows: [] } });
    const { container } = render(React.createElement(ViewTabBody, { tab, client: {} as never, index: 0 }));
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });
});
