import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useEditorScrollRetention } from './useEditorScrollRetention';

// A stand-in for `.editor-body`: jsdom has no layout, but it does store whatever `scrollTop` is
// written to it, which is all this hook reads and writes.
function makeBody(): { ref: React.RefObject<HTMLElement | null>; body: HTMLElement } {
  const body = document.createElement('div');
  document.body.append(body);
  const ref = createRef<HTMLElement>();
  ref.current = body;
  return { ref, body };
}

// What a browser does to a hidden tab body: the box is gone, so the scroll offset goes with it.
function hide(body: HTMLElement): void {
  body.scrollTop = 0;
}

function renderRetention(ref: React.RefObject<HTMLElement | null>, visible: boolean) {
  return renderHook(
    ({ shown }: { shown: boolean }) => useEditorScrollRetention(ref, shown),
    { initialProps: { shown: visible } },
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('useEditorScrollRetention', () => {
  it('puts the recorded offset back when the tab becomes visible again', () => {
    const { ref, body } = makeBody();
    const { result, rerender } = renderRetention(ref, true);

    body.scrollTop = 420;
    result.current();
    rerender({ shown: false });
    hide(body);
    rerender({ shown: true });

    expect(body.scrollTop).toBe(420);
  });

  it('ignores a scroll reported while the tab is hidden', () => {
    const { ref, body } = makeBody();
    const { result, rerender } = renderRetention(ref, true);

    body.scrollTop = 420;
    result.current();
    rerender({ shown: false });
    hide(body);
    result.current();
    rerender({ shown: true });

    expect(body.scrollTop).toBe(420);
  });

  it('tracks the latest offset, not the first one recorded', () => {
    const { ref, body } = makeBody();
    const { result, rerender } = renderRetention(ref, true);

    body.scrollTop = 100;
    result.current();
    body.scrollTop = 260;
    result.current();
    rerender({ shown: false });
    hide(body);
    rerender({ shown: true });

    expect(body.scrollTop).toBe(260);
  });

  it('leaves a tab that was never hidden where it is', () => {
    const { ref, body } = makeBody();
    const { result, rerender } = renderRetention(ref, true);

    body.scrollTop = 300;
    result.current();
    rerender({ shown: true });

    expect(body.scrollTop).toBe(300);
  });

  it('restores nothing when the body has gone away', () => {
    const { ref, body } = makeBody();
    const { result, rerender } = renderRetention(ref, true);

    body.scrollTop = 180;
    result.current();
    rerender({ shown: false });
    ref.current = null;

    expect(() => { rerender({ shown: true }); result.current(); }).not.toThrow();
  });
});
