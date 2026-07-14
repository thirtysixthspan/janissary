import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PageView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { PageTab } from './PageTab';

function makePage(overrides: Partial<PageView> = {}): PageView {
  return {
    url: 'https://slashdot.org/',
    domain: 'slashdot.org',
    number: 1,
    ...overrides,
  };
}

function makeClient(): JanusClient {
  return { pageSync: vi.fn() } as unknown as JanusClient;
}

describe('PageTab', () => {
  it('renders an iframe with the page URL as src', () => {
    const page = makePage({ url: 'https://slashdot.org/' });
    const { container } = render(<PageTab page={page} closeTab={vi.fn()} index={0} client={makeClient()} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toBe('https://slashdot.org/');
  });

  it('sets the iframe title to the domain', () => {
    const page = makePage({ number: 2, domain: 'example.com', url: 'https://example.com/' });
    const { container } = render(<PageTab page={page} closeTab={vi.fn()} index={0} client={makeClient()} />);
    expect(container.querySelector('iframe')?.title).toBe('example.com');
  });

  it('shows only the full URL in the metadata header', () => {
    const page = makePage({ number: 3, domain: 'example.com', url: 'https://example.com/path' });
    const { container } = render(<PageTab page={page} closeTab={vi.fn()} index={0} client={makeClient()} />);
    expect(container.querySelector('.page-number')).toBeNull();
    expect(container.querySelector('.page-domain')).toBeNull();
    expect(container.querySelector('.page-url')?.textContent).toBe('https://example.com/path');
  });

  it('clicking the close button calls closeTab with the tab index', () => {
    const closeTab = vi.fn();
    const page = makePage();
    const { container } = render(<PageTab page={page} closeTab={closeTab} index={4} client={makeClient()} />);
    const closeButton = container.querySelector('.page-close');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton as Element);
    expect(closeTab).toHaveBeenCalledWith(4);
  });
});
