import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingQuestionView, TabView } from '@shared/protocol';
import { QuestionPanel } from './shared/questions/QuestionPanel';
import type { JanusClient } from './shared/ws/ws';
import { useQuestionFocusReturn } from './useQuestionFocusReturn';

const question: PendingQuestionView = {
  id: 'question-1', tab: 'claude', kind: 'ask', question: 'What now?',
};

function harnessTab(label: string, pendingQuestion?: PendingQuestionView): TabView {
  return {
    label, view: 'harness', harness: { ptyId: label },
    ...(pendingQuestion && { pendingQuestion }),
  } as unknown as TabView;
}

function setup() {
  const client = { send: vi.fn() } as unknown as JanusClient;
  const terminalRef = React.createRef<HTMLTextAreaElement>();
  const focus = vi.fn(() => terminalRef.current?.focus());
  const harnessHandles = { current: new Map([['claude', { focus }], ['other', { focus }]]) };

  function HarnessWithQuestion({ current }: { current: TabView }) {
    const currentRef = useRef<TabView | undefined>(current);
    currentRef.current = current;
    const inputReference = useRef<HTMLTextAreaElement>(null);
    const onBeforeRemove = useQuestionFocusReturn(currentRef, harnessHandles, inputReference);
    return (
      <>
        <textarea aria-label="Harness terminal" ref={terminalRef} />
        <textarea aria-label="Other pane command line" ref={inputReference} />
        {current.pendingQuestion && <QuestionPanel question={current.pendingQuestion} client={client} onBeforeRemove={onBeforeRemove} />}
      </>
    );
  }

  const { rerender } = render(<HarnessWithQuestion current={harnessTab('claude', question)} />);
  const answer = screen.getByRole('textbox', { name: 'Answer' });
  expect(answer).toHaveFocus();
  const resolve = (current = harnessTab('claude')) => {
    rerender(<HarnessWithQuestion current={current} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  };
  return { answer, focus, resolve };
}

describe('useQuestionFocusReturn', () => {
  it('focuses the same harness terminal when its focused question panel goes away', () => {
    const { focus, resolve } = setup();

    resolve();

    expect(focus).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox', { name: 'Harness terminal' })).toHaveFocus();
  });

  it('leaves focus on the body if the answer field had already blurred', () => {
    const { answer, focus, resolve } = setup();
    answer.blur();
    expect(document.body).toHaveFocus();

    resolve();

    expect(focus).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });

  it('leaves focus on another control at resolution', () => {
    const { focus, resolve } = setup();
    const commandLine = screen.getByRole('textbox', { name: 'Other pane command line' });
    commandLine.focus();

    resolve();

    expect(focus).not.toHaveBeenCalled();
    expect(commandLine).toHaveFocus();
  });

  it('leaves tab switch focus to the tab switch handler', () => {
    const { focus, resolve } = setup();

    resolve(harnessTab('other'));

    expect(focus).not.toHaveBeenCalled();
  });
});
