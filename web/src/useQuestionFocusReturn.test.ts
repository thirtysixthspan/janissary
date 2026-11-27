import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PendingQuestionView, TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './shared/tab/handles';
import { useQuestionFocusReturn } from './useQuestionFocusReturn';

function refOf<T>(value: T): React.RefObject<T> {
  return { current: value };
}

const question: PendingQuestionView = {
  id: 'question-1', tab: 'claude', kind: 'ask', question: 'What now?',
};

function harnessTab(pendingQuestion?: PendingQuestionView): TabView {
  return {
    label: 'claude', view: 'harness', harness: { ptyId: 'pty-1' },
    ...(pendingQuestion && { pendingQuestion }),
  } as unknown as TabView;
}

function setup() {
  const focus = vi.fn();
  const harnessHandles = refOf(new Map([['pty-1', { focus } as unknown as HarnessTabHandle]]));
  const inputReference = refOf<HTMLTextAreaElement | null>(null);
  const currentRef = refOf<TabView | undefined>(harnessTab(question));
  const { rerender } = renderHook(() => useQuestionFocusReturn(currentRef, harnessHandles, inputReference));
  return { focus, currentRef, rerender };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('useQuestionFocusReturn', () => {
  it('focuses the harness terminal when its question resolves while the panel held focus', () => {
    const { focus, currentRef, rerender } = setup();
    expect(focus).not.toHaveBeenCalled();

    const panel = document.createElement('button');
    document.body.append(panel);
    panel.focus();
    panel.remove();
    expect(document.activeElement).toBe(document.body);

    currentRef.current = harnessTab();
    rerender();

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('leaves focus alone when it is elsewhere at resolution', () => {
    const { focus, currentRef, rerender } = setup();
    const commandLine = document.createElement('textarea');
    document.body.append(commandLine);
    commandLine.focus();
    expect(document.activeElement).toBe(commandLine);

    currentRef.current = harnessTab();
    rerender();

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(commandLine);
  });
});
