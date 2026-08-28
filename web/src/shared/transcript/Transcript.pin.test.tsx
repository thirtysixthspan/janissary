import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BufferLine } from '@shared/protocol';
import type { JanusClient } from '../../ws';
import { Transcript } from './Transcript';

vi.mock('../../useXterm', () => ({
  useXterm: vi.fn(() => () => {}),
}));

// jsdom doesn't include ResizeObserver — Transcript observes its content element. The stub keeps
// the last callback so a content resize can be replayed on demand.
let resize: (() => void) | undefined;
vi.stubGlobal('ResizeObserver', class {
  constructor(callback: () => void) { resize = callback; }
  observe() {}
  unobserve() {}
  disconnect() { resize = undefined; }
});

const client = { send: vi.fn() } as unknown as JanusClient;

function outputLines(count: number): BufferLine[] {
  return Array.from({ length: count }, (_, i) => ({ type: 'output', text: `line ${i}` }));
}

// jsdom has no layout, so the viewport's scroll metrics are stubbed as writable properties.
function stubMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperties(element, {
    scrollTop: { value: 0, writable: true, configurable: true },
    scrollHeight: { value: scrollHeight, writable: true, configurable: true },
    clientHeight: { value: clientHeight, writable: true, configurable: true },
  });
}

// `scrollHeight` is read-only in the DOM types; growing it stands in for more content arriving.
function grow(element: HTMLElement, scrollHeight: number) {
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, writable: true, configurable: true });
}

function renderTranscript(pinToBottom?: boolean) {
  const scrollRef = React.createRef<HTMLDivElement>();
  const view = (lines: BufferLine[]) => (
    <Transcript
      lines={lines}
      client={client}
      onToggleCollapse={() => {}}
      onPromptClick={() => {}}
      scrollRef={scrollRef}
      pinToBottom={pinToBottom}
    />
  );
  const { rerender } = render(view(outputLines(1)));
  const element = scrollRef.current!;
  stubMetrics(element, 1000, 300);
  return { element, show: (count: number) => rerender(view(outputLines(count))) };
}

describe('Transcript auto-scroll', () => {
  it('pins the viewport to the bottom when new output arrives', () => {
    const { element, show } = renderTranscript();
    show(2);
    expect(element.scrollTop).toBe(1000);
  });

  it('keeps following long output when a pin\'s scroll event lands after the content grew', () => {
    const { element, show } = renderTranscript();
    show(2);
    grow(element, 5000);
    fireEvent.scroll(element);
    show(3);
    expect(element.scrollTop).toBe(5000);
  });

  it('stops following once the user scrolls away from the bottom', () => {
    const { element, show } = renderTranscript();
    show(2);
    element.scrollTop = 200;
    fireEvent.scroll(element);
    show(3);
    expect(element.scrollTop).toBe(200);
  });

  it('resumes following when the user scrolls back to the bottom', () => {
    const { element, show } = renderTranscript();
    show(2);
    element.scrollTop = 200;
    fireEvent.scroll(element);
    element.scrollTop = 690;
    fireEvent.scroll(element);
    show(3);
    expect(element.scrollTop).toBe(1000);
  });

  it('pins to the new bottom when the content resizes without new lines', () => {
    const { element, show } = renderTranscript();
    show(2);
    grow(element, 4000);
    resize?.();
    expect(element.scrollTop).toBe(4000);
  });

  it('leaves the viewport alone when pinning is off', () => {
    const { element, show } = renderTranscript(false);
    show(2);
    expect(element.scrollTop).toBe(0);
  });
});
