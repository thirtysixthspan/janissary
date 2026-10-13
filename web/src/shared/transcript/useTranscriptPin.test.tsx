import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BufferLine } from '@shared/protocol';
import { useTranscriptPin } from './useTranscriptPin';

const lines: BufferLine[] = [{ type: 'output', text: 'line' }];

function PinHarness({
  scrollRef,
  currentLines = lines,
  highlight,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  currentLines?: BufferLine[];
  highlight?: { lineIndex: number; pattern: string };
}) {
  const { contentRef, onScroll } = useTranscriptPin({
    lines: currentLines,
    highlight,
    pinToBottom: true,
    scrollRef,
  });
  return <div ref={scrollRef} onScroll={onScroll}><div ref={contentRef}><span data-search-hit /></div></div>;
}

describe('useTranscriptPin', () => {
  it('disconnects its content resize observer on unmount', () => {
    const disconnectObserver = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() { disconnectObserver(); }
    });
    const scrollRef = React.createRef<HTMLDivElement>();
    const view = render(<PinHarness scrollRef={scrollRef} />);
    view.unmount();
    expect(disconnectObserver).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('scrolls a highlighted hit with two lines of context instead of pinning to the bottom', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const scrollRef = React.createRef<HTMLDivElement>();
    const view = render(<PinHarness scrollRef={scrollRef} />);
    const viewport = scrollRef.current!;
    Object.defineProperties(viewport, {
      scrollTop: { value: 0, writable: true, configurable: true },
      scrollHeight: { value: 1000, writable: true, configurable: true },
      clientHeight: { value: 300, writable: true, configurable: true },
    });
    const hit = viewport.querySelector('[data-search-hit]')!;
    Object.defineProperty(hit, 'offsetTop', { value: 444, configurable: true });

    view.rerender(<PinHarness scrollRef={scrollRef} currentLines={[...lines]} highlight={{ lineIndex: 0, pattern: 'line' }} />);

    expect(viewport.scrollTop).toBe(188);
    vi.unstubAllGlobals();
  });
});
