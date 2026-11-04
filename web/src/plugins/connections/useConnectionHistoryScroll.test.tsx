import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConnectionHistoryScroll } from './useConnectionHistoryScroll';

type ScrollMetrics = { height: number; top: number; client: number };

function Mount({ active, offset, hasOlder, loadOlder, contentKey, activityText = '',
  initial = { height: 500, top: 500, client: 100 } }: {
  active: boolean; offset: number; hasOlder: boolean; loadOlder: () => Promise<unknown>;
  contentKey: number; activityText?: string; initial?: ScrollMetrics;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initialMetrics = useRef(initial);
  const scrollContentKey = useMemo(() => [contentKey, 'message', activityText], [activityText, contentKey]);
  const scroll = useConnectionHistoryScroll(ref, active, offset, hasOlder, loadOlder, scrollContentKey);
  useLayoutEffect(() => {
    if (ref.current) metrics(ref.current, initialMetrics.current);
  }, []);
  return <div data-testid="scroller" ref={ref} onScroll={(event) => scroll.onScroll(event.currentTarget)}>
    <div style={{ height: `${contentKey * 100}px` }} />
  </div>;
}

function metrics(element: HTMLElement, values: ScrollMetrics) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: values.height },
    scrollTop: { configurable: true, writable: true, value: values.top },
    clientHeight: { configurable: true, value: values.client },
  });
}

describe('useConnectionHistoryScroll', () => {
  it('follows streamed activity text growth while active and near the bottom', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={1} activityText="first" />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 500, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 600, top: 500, client: 100 });
    view.rerender(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={1} activityText="first chunk" />);
    expect(element.scrollTop).toBe(600);
  });

  it('does not follow streamed activity text growth after the reader scrolls away', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={1} activityText="first" />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 200, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 600, top: 200, client: 100 });
    view.rerender(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={1} activityText="first chunk" />);
    expect(element.scrollTop).toBe(200);
  });

  it('starts at newest content and follows active output only while near bottom', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={1} />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 500, client: 100 });
    view.rerender(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={2} />);
    expect(element.scrollTop).toBe(500);
    metrics(element, { height: 600, top: 500, client: 100 });
    fireEvent.scroll(element);
    view.rerender(<Mount active offset={0} hasOlder={false} loadOlder={loadOlder} contentKey={3} />);
    expect(element.scrollTop).toBe(600);
  });

  it('requests a top page once per offset and skips it without older history', async () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={4} hasOlder loadOlder={loadOlder} contentKey={1} />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 500, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 500, top: 0, client: 100 });
    fireEvent.scroll(element);
    fireEvent.scroll(element);
    expect(loadOlder).toHaveBeenCalledTimes(1);
    view.rerender(<Mount active offset={5} hasOlder={false} loadOlder={loadOlder} contentKey={2} />);
    metrics(element, { height: 600, top: 0, client: 100 });
    fireEvent.scroll(element);
    expect(loadOlder).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it('loads older pages automatically while the history fits the viewport', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={1} hasOlder loadOlder={loadOlder} contentKey={1}
      initial={{ height: 300, top: 0, client: 400 }} />);
    const element = view.getByTestId('scroller');
    expect(loadOlder).toHaveBeenCalledTimes(1);
    expect(element.scrollTop).toBe(300);
    metrics(element, { height: 350, top: 300, client: 400 });
    view.rerender(<Mount active offset={0} hasOlder loadOlder={loadOlder} contentKey={2} />);
    expect(element.scrollTop).toBe(350);
    expect(loadOlder).toHaveBeenCalledTimes(2);
    metrics(element, { height: 700, top: 350, client: 400 });
    view.rerender(<Mount active offset={0} hasOlder loadOlder={loadOlder} contentKey={3} />);
    expect(element.scrollTop).toBe(700);
    expect(loadOlder).toHaveBeenCalledTimes(2);
  });

  it('loads older pages when a resize makes the history fit the viewport', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={2} hasOlder loadOlder={loadOlder} contentKey={1}
      initial={{ height: 600, top: 600, client: 300 }} />);
    const element = view.getByTestId('scroller');
    expect(loadOlder).not.toHaveBeenCalled();
    metrics(element, { height: 600, top: 600, client: 700 });
    fireEvent(globalThis.window, new Event('resize'));
    expect(loadOlder).toHaveBeenCalledTimes(1);
    metrics(element, { height: 600, top: 600, client: 800 });
    fireEvent(globalThis.window, new Event('resize'));
    expect(loadOlder).toHaveBeenCalledTimes(1);
  });

  it('clears the page guard after rejection so the same offset can be retried', async () => {
    const loadOlder = vi.fn().mockRejectedValueOnce(new Error('rejected')).mockResolvedValueOnce(null);
    const view = render(<Mount active offset={4} hasOlder loadOlder={loadOlder} contentKey={1} />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 0, client: 100 });
    fireEvent.scroll(element);
    await act(async () => { await Promise.resolve(); });
    fireEvent.scroll(element);
    expect(loadOlder).toHaveBeenCalledTimes(2);
  });

  it('preserves the viewport after older blocks are prepended', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={4} hasOlder loadOlder={loadOlder} contentKey={1} />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 500, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 500, top: 0, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 700, top: 0, client: 100 });
    view.rerender(<Mount active offset={2} hasOlder loadOlder={loadOlder} contentKey={2} />);
    expect(element.scrollTop).toBe(200);
  });

  it('preserves the viewport when streamed activity grows before an older page arrives', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={4} hasOlder loadOlder={loadOlder} contentKey={1} activityText="first" />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 500, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 500, top: 0, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 650, top: 0, client: 100 });
    view.rerender(<Mount active offset={4} hasOlder loadOlder={loadOlder} contentKey={1} activityText="first chunk" />);
    expect(element.scrollTop).toBe(0);
    metrics(element, { height: 850, top: 0, client: 100 });
    view.rerender(<Mount active offset={2} hasOlder loadOlder={loadOlder} contentKey={2} activityText="first chunk" />);
    expect(element.scrollTop).toBe(200);
    expect(element.scrollTop).not.toBe(element.scrollHeight);
  });

  it('keeps the viewport and pending restoration when a new block arrives before an older page', () => {
    const loadOlder = vi.fn(async () => null);
    const view = render(<Mount active offset={24} hasOlder loadOlder={loadOlder} contentKey={1} />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 500, client: 100 });
    fireEvent.scroll(element);
    metrics(element, { height: 500, top: 0, client: 100 });
    fireEvent.scroll(element);
    expect(loadOlder).toHaveBeenCalledTimes(1);
    metrics(element, { height: 620, top: 0, client: 100 });
    view.rerender(<Mount active offset={25} hasOlder loadOlder={loadOlder} contentKey={2} />);
    expect(element.scrollTop).toBe(0);
    metrics(element, { height: 820, top: 0, client: 100 });
    view.rerender(<Mount active offset={4} hasOlder loadOlder={loadOlder} contentKey={3} />);
    expect(element.scrollTop).toBe(200);
  });

  it('does not follow output while inactive', () => {
    const view = render(<Mount active={false} offset={0} hasOlder={false} loadOlder={async () => null} contentKey={1} />);
    const element = view.getByTestId('scroller');
    metrics(element, { height: 500, top: 0, client: 100 });
    view.rerender(<Mount active={false} offset={0} hasOlder={false} loadOlder={async () => null} contentKey={2} />);
    expect(element.scrollTop).toBe(0);
  });
});
