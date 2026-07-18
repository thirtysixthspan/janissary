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
  return { pageSync: vi.fn(), navigatePage: vi.fn() } as unknown as JanusClient;
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

  it('renders back, forward, and reload buttons before the URL', () => {
    const { container } = render(<PageTab page={makePage()} closeTab={vi.fn()} index={0} client={makeClient()} />);
    const meta = container.querySelector('.page-meta')!;
    const nav = meta.querySelector('.page-nav')!;
    expect(nav.querySelector('.page-back')).not.toBeNull();
    expect(nav.querySelector('.page-forward')).not.toBeNull();
    expect(nav.querySelector('.page-reload')).not.toBeNull();
    const url = meta.querySelector('.page-url')!;
    expect(nav.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clicking back calls history.back on the embedded frame', () => {
    const { container } = render(<PageTab page={makePage()} closeTab={vi.fn()} index={0} client={makeClient()} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const back = vi.spyOn(iframe.contentWindow!.history, 'back').mockImplementation(() => {});
    fireEvent.click(container.querySelector('.page-back') as Element);
    expect(back).toHaveBeenCalled();
  });

  it('clicking forward calls history.forward on the embedded frame', () => {
    const { container } = render(<PageTab page={makePage()} closeTab={vi.fn()} index={0} client={makeClient()} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const forward = vi.spyOn(iframe.contentWindow!.history, 'forward').mockImplementation(() => {});
    fireEvent.click(container.querySelector('.page-forward') as Element);
    expect(forward).toHaveBeenCalled();
  });

  it('clicking reload keeps the iframe pointed at the same URL', () => {
    const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={0} client={makeClient()} />);
    fireEvent.click(container.querySelector('.page-reload') as Element);
    expect(container.querySelector('iframe')?.src).toBe('https://slashdot.org/');
  });

  it('double-clicking the URL enters edit mode with the current address prefilled', () => {
    const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={2} client={makeClient()} />);
    fireEvent.doubleClick(container.querySelector('.page-url') as Element);
    const input = container.querySelector('.page-url-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('https://slashdot.org/');
  });

  it('pressing Enter commits the new address via navigatePage', () => {
    const client = makeClient();
    const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={2} client={client} />);
    fireEvent.doubleClick(container.querySelector('.page-url') as Element);
    const input = container.querySelector('.page-url-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(client.navigatePage).toHaveBeenCalledWith(2, 'example.com');
  });

  it('pressing Escape cancels without navigating', () => {
    const client = makeClient();
    const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={2} client={client} />);
    fireEvent.doubleClick(container.querySelector('.page-url') as Element);
    const input = container.querySelector('.page-url-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(container.querySelector('.page-url-input')).toBeNull();
    expect(client.navigatePage).not.toHaveBeenCalled();
  });
});
