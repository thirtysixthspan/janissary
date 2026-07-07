import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTranscriptScroll } from './useTranscriptScroll';

function makeScrollElement(scrollTop: number, scrollHeight: number, clientHeight: number) {
  const el = document.createElement('div');
  Object.defineProperties(el, {
    scrollTop: { value: scrollTop, writable: true },
    scrollHeight: { value: scrollHeight, writable: true },
    clientHeight: { value: clientHeight, writable: true },
  });
  return el;
}

function TestComponent({
  scrollTop, scrollHeight, clientHeight, onKey, onKeyUp,
}: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  onKey?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const realRef = useRef<HTMLDivElement | null>(makeScrollElement(scrollTop, scrollHeight, clientHeight));
  scrollRef.current = realRef.current;
  const { handleScrollKey, handleScrollKeyUp } = useTranscriptScroll(scrollRef as never);

  React.useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (handleScrollKey(e)) onKey?.(e); };
    const ku = (e: KeyboardEvent) => { handleScrollKeyUp(e); onKeyUp?.(e); };
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    return () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); };
  }, [handleScrollKey, handleScrollKeyUp, onKey, onKeyUp]);

  return React.createElement('div', { ref: scrollRef });
}

function dispatchKey(key: string, opts: { shiftKey?: boolean; ctrlKey?: boolean } = {}) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey: opts.shiftKey ?? false, ctrlKey: opts.ctrlKey ?? false, bubbles: true }),
  );
}

function dispatchKeyUp(key: string) {
  document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

describe('useTranscriptScroll', () => {
  it('returns false when scrollRef.current is null', () => {
    function NullRefComponent() {
      const scrollRef = useRef<HTMLDivElement | null>(null);
      const { handleScrollKey } = useTranscriptScroll(scrollRef as never);
      expect(handleScrollKey(new KeyboardEvent('keydown', { key: 'PageDown' }))).toBe(false);
      return null;
    }
    render(React.createElement(NullRefComponent));
  });

  it('PageUp scrolls up by half clientHeight', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 100, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('PageUp');
    expect(onKey).toHaveBeenCalled();
  });

  it('PageDown scrolls down by half clientHeight', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('PageDown');
    expect(onKey).toHaveBeenCalled();
  });

  it('Shift+ArrowUp scrolls up', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 100, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('ArrowUp', { shiftKey: true });
    expect(onKey).toHaveBeenCalled();
  });

  it('Shift+ArrowDown scrolls down', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('ArrowDown', { shiftKey: true });
    expect(onKey).toHaveBeenCalled();
  });

  it('Ctrl+ArrowUp scrolls up', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 100, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('ArrowUp', { ctrlKey: true });
    expect(onKey).toHaveBeenCalled();
  });

  it('Ctrl+ArrowDown scrolls down', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('ArrowDown', { ctrlKey: true });
    expect(onKey).toHaveBeenCalled();
  });

  it('Ctrl+P scrolls up by one line', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 50, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('p', { ctrlKey: true });
    expect(onKey).toHaveBeenCalled();
  });

  it('Ctrl+N scrolls down by one line', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('n', { ctrlKey: true });
    expect(onKey).toHaveBeenCalled();
  });

  it('Escape jumps to bottom', () => {
    const onKey = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKey }));
    dispatchKey('Escape');
    expect(onKey).toHaveBeenCalled();
  });

  it('returns false for an unhandled key', () => {
    function CaptureReturn() {
      const scrollRef = useRef<HTMLDivElement | null>(null);
      const el = makeScrollElement(0, 500, 200);
      scrollRef.current = el;
      const { handleScrollKey } = useTranscriptScroll(scrollRef as never);
      expect(handleScrollKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
      return null;
    }
    render(React.createElement(CaptureReturn));
  });

  it('keyup on ArrowUp resets acceleration', () => {
    const onKeyUp = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKeyUp }));
    dispatchKeyUp('ArrowUp');
    expect(onKeyUp).toHaveBeenCalled();
  });

  it('keyup on ArrowDown resets acceleration', () => {
    const onKeyUp = vi.fn();
    render(React.createElement(TestComponent, { scrollTop: 0, scrollHeight: 500, clientHeight: 200, onKeyUp }));
    dispatchKeyUp('ArrowDown');
    expect(onKeyUp).toHaveBeenCalled();
  });
});
