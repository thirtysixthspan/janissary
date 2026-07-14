import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { usePageContentSync } from './usePageContentSync';

function makeClient() {
  const pageSync = vi.fn();
  return { client: { pageSync } as unknown as JanusClient, pageSync };
}

function postMessage(source: MessageEventSource | null, data: unknown): void {
  act(() => {
    globalThis.dispatchEvent(new MessageEvent('message', { data, source }));
  });
}

describe('usePageContentSync', () => {
  it('forwards visible text posted by the matching iframe', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const ref = React.createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;
    const { client, pageSync } = makeClient();
    renderHook(() => usePageContentSync(ref, 'https://example.org', client));

    postMessage(iframe.contentWindow, { source: 'janissary-page-content', url: 'https://example.org', text: 'visible text' });
    expect(pageSync).toHaveBeenCalledWith('https://example.org', 'visible text');
    iframe.remove();
  });

  it('ignores messages from a different window', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const ref = React.createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;
    const { client, pageSync } = makeClient();
    renderHook(() => usePageContentSync(ref, 'https://example.org', client));

    postMessage(null, { source: 'janissary-page-content', text: 'from elsewhere' });
    expect(pageSync).not.toHaveBeenCalled();
    iframe.remove();
  });

  it('ignores messages missing the source marker', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const ref = React.createRef<HTMLIFrameElement>();
    (ref as { current: HTMLIFrameElement }).current = iframe;
    const { client, pageSync } = makeClient();
    renderHook(() => usePageContentSync(ref, 'https://example.org', client));

    postMessage(iframe.contentWindow, { text: 'no marker' });
    expect(pageSync).not.toHaveBeenCalled();
    iframe.remove();
  });
});
