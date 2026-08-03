import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PagePayload } from '@shared/plugins/page/shared';
import type { TabPluginClientCapabilities } from '../api';
import { PageTab } from './PageTab';

function makePage(overrides: Partial<PagePayload> = {}): PagePayload {
  return { url: 'https://slashdot.org/', domain: 'slashdot.org', ...overrides };
}

function makeCapabilities(
  { active = true, onSplit, close = vi.fn() }:
  { active?: boolean; onSplit?: () => void; close?: () => void } = {},
) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    splitAction: onSplit
      ? <button type="button" className="tab-split" onClick={onSplit}>Split</button>
      : null,
    active,
    dock: null,
    close,
    reportFailure: vi.fn(),
  };
  return { capabilities, intent, close };
}

function renderTab(
  page: PagePayload = makePage(),
  options: { active?: boolean; onSplit?: () => void; close?: () => void } = {},
) {
  const { capabilities, intent, close } = makeCapabilities(options);
  return { ...render(<PageTab payload={page} capabilities={capabilities} />), intent, close };
}

describe('PageTab', () => {
  it('renders an iframe with the page URL as src', () => {
    const { container } = renderTab(makePage({ url: 'https://slashdot.org/' }));
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toBe('https://slashdot.org/');
  });

  it('sets the iframe title to the domain', () => {
    const { container } = renderTab(makePage({ domain: 'example.com', url: 'https://example.com/' }));
    expect(container.querySelector('iframe')?.title).toBe('example.com');
  });

  it('shows only the full URL in the metadata header', () => {
    const { container } = renderTab(makePage({ domain: 'example.com', url: 'https://example.com/path' }));
    expect(container.querySelector('.page-number')).toBeNull();
    expect(container.querySelector('.page-domain')).toBeNull();
    expect(container.querySelector('.page-url')?.textContent).toBe('https://example.com/path');
  });

  it('clicking the close button closes this tab', () => {
    const close = vi.fn();
    const { container } = renderTab(makePage(), { close });
    const closeButton = container.querySelector('.page-close');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton as Element);
    expect(close).toHaveBeenCalledOnce();
  });

  it('offers Split and covers an inactive iframe until its pane is focused', () => {
    const onSplit = vi.fn();
    const { container, getByRole } = renderTab(makePage(), { active: false, onSplit });
    fireEvent.click(getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalledOnce();
    expect(container.querySelector('.page-focus-catcher')).toBeInTheDocument();
  });

  it('groups back, forward, and reload with the right-side actions after the URL', () => {
    const { container } = renderTab();
    const meta = container.querySelector('.page-meta')!;
    const actions = container.querySelector('.page-actions')!;
    const nav = actions.querySelector('.page-nav')!;
    expect(nav.querySelector('.page-back')).not.toBeNull();
    expect(nav.querySelector('.page-forward')).not.toBeNull();
    expect(nav.querySelector('.page-reload')).not.toBeNull();
    const url = meta.querySelector('.page-url')!;
    expect(url.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clicking back calls history.back on the embedded frame', () => {
    const { container } = renderTab();
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const back = vi.spyOn(iframe.contentWindow!.history, 'back').mockImplementation(() => {});
    fireEvent.click(container.querySelector('.page-back') as Element);
    expect(back).toHaveBeenCalled();
  });

  it('clicking forward calls history.forward on the embedded frame', () => {
    const { container } = renderTab();
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const forward = vi.spyOn(iframe.contentWindow!.history, 'forward').mockImplementation(() => {});
    fireEvent.click(container.querySelector('.page-forward') as Element);
    expect(forward).toHaveBeenCalled();
  });

  it('clicking reload keeps the iframe pointed at the same URL', () => {
    const { container } = renderTab(makePage({ url: 'https://slashdot.org/' }));
    fireEvent.click(container.querySelector('.page-reload') as Element);
    expect(container.querySelector('iframe')?.src).toBe('https://slashdot.org/');
  });

  it('double-clicking the URL enters edit mode with the current address prefilled', () => {
    const { container } = renderTab(makePage({ url: 'https://slashdot.org/' }));
    fireEvent.doubleClick(container.querySelector('.page-url') as Element);
    const input = container.querySelector('.page-url-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('https://slashdot.org/');
  });

  it('pressing Enter commits the new address through the navigate intent', () => {
    const { container, intent } = renderTab(makePage({ url: 'https://slashdot.org/' }));
    fireEvent.doubleClick(container.querySelector('.page-url') as Element);
    const input = container.querySelector('.page-url-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('navigate', { url: 'example.com' });
  });

  it('pressing Escape cancels without navigating', () => {
    const { container, intent } = renderTab(makePage({ url: 'https://slashdot.org/' }));
    fireEvent.doubleClick(container.querySelector('.page-url') as Element);
    const input = container.querySelector('.page-url-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(container.querySelector('.page-url-input')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
  });

  it('relays the embedded page content and its live address through the sync intent', () => {
    const { container, intent } = renderTab(makePage({ url: 'https://slashdot.org/' }));
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    act(() => {
      globalThis.dispatchEvent(new MessageEvent('message', {
        data: { source: 'janissary-page-content', url: 'https://slashdot.org/story/1', text: 'story text' },
        source: iframe.contentWindow,
      }));
    });
    expect(intent).toHaveBeenCalledWith('sync', {
      url: 'https://slashdot.org/story/1', text: 'story text',
    });
  });

  it('closes the tab when the browser tries to close the window over an active page', () => {
    const close = vi.fn();
    renderTab(makePage(), { close });
    act(() => { globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })); });
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves a browser-level close alone while the page tab is not the visible one', () => {
    const close = vi.fn();
    renderTab(makePage(), { active: false, close });
    act(() => { globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })); });
    expect(close).not.toHaveBeenCalled();
  });
});
