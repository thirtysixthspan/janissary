import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePageContentSync } from './usePageContentSync';

function mountedFrame() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const ref = React.createRef<HTMLIFrameElement>();
  (ref as { current: HTMLIFrameElement }).current = iframe;
  const sync = vi.fn();
  renderHook(() => usePageContentSync(ref, 'https://example.org', sync));
  return { iframe, sync };
}

function postMessage(source: MessageEventSource | null, data: unknown): void {
  act(() => {
    globalThis.dispatchEvent(new MessageEvent('message', { data, source }));
  });
}

describe('usePageContentSync', () => {
  it('forwards visible text posted by the matching iframe', () => {
    const { iframe, sync } = mountedFrame();
    postMessage(iframe.contentWindow, { source: 'janissary-page-content', url: 'https://example.org', text: 'visible text' });
    expect(sync).toHaveBeenCalledWith('https://example.org', 'visible text');
    iframe.remove();
  });

  it('ignores messages from a different window', () => {
    const { iframe, sync } = mountedFrame();
    postMessage(null, { source: 'janissary-page-content', text: 'from elsewhere' });
    expect(sync).not.toHaveBeenCalled();
    iframe.remove();
  });

  it('ignores messages missing the source marker', () => {
    const { iframe, sync } = mountedFrame();
    postMessage(iframe.contentWindow, { text: 'no marker' });
    expect(sync).not.toHaveBeenCalled();
    iframe.remove();
  });

  it('reports the live address when the embedded page has navigated', () => {
    const { iframe, sync } = mountedFrame();
    postMessage(iframe.contentWindow, { source: 'janissary-page-content', url: 'https://example.org/other', text: 'visible text' });
    expect(sync).toHaveBeenCalledWith('https://example.org/other', 'visible text');
    iframe.remove();
  });

  it('falls back to the tab address when the relay carries no url', () => {
    const { iframe, sync } = mountedFrame();
    postMessage(iframe.contentWindow, { source: 'janissary-page-content', text: 'visible text' });
    expect(sync).toHaveBeenCalledWith('https://example.org', 'visible text');
    iframe.remove();
  });
});
