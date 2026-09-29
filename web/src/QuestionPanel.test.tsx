import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingQuestionView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { QuestionPanel } from './QuestionPanel';
import type { QuestionPanelHandle } from './shared/tab/handles';

function client() {
  const send = vi.fn();
  return { value: { send } as unknown as JanusClient, send };
}

describe('QuestionPanel', () => {
  it('renders approve options and sends the chosen label', async () => {
    const { value, send } = client();
    const question: PendingQuestionView = {
      id: 'question-1',
      tab: 'build',
      kind: 'approve',
      question: 'Deploy to prod?',
      options: ['Yes', 'No'],
    };
    render(<QuestionPanel question={question} client={value} />);

    expect(screen.getByText('Deploy to prod?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-1', answer: 'Yes' },
    });
  });

  it('renders a text input and sends the typed answer', async () => {
    const { value, send } = client();
    const question: PendingQuestionView = {
      id: 'question-2',
      tab: 'build',
      kind: 'ask',
      question: 'What port?',
    };
    render(<QuestionPanel question={question} client={value} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Answer' }), '4321');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-2', answer: '4321' },
    });
  });

  it('sends the cancel marker', async () => {
    const { value, send } = client();
    const question: PendingQuestionView = {
      id: 'question-3',
      tab: 'build',
      kind: 'ask',
      question: 'What port?',
    };
    render(<QuestionPanel question={question} client={value} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-3', answer: null },
    });
  });

  it('is non-modal and does not trap unrelated input', async () => {
    const behind = vi.fn();
    const { value } = client();
    const question: PendingQuestionView = {
      id: 'question-4',
      tab: 'build',
      kind: 'approve',
      question: 'Continue?',
      options: ['Yes'],
    };
    render(
      <>
        <button onClick={behind}>Other action</button>
        <QuestionPanel question={question} client={value} />
      </>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Other action' }));
    expect(behind).toHaveBeenCalledOnce();
  });

  it('focuses Cancel on render for an approve question', () => {
    const { value } = client();
    const question: PendingQuestionView = {
      id: 'question-5', tab: 'build', kind: 'approve', question: 'Deploy to prod?', options: ['Yes', 'No'],
    };
    render(<QuestionPanel question={question} client={value} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('focuses the text input on render for an ask question', () => {
    const { value } = client();
    const question: PendingQuestionView = { id: 'question-6', tab: 'build', kind: 'ask', question: 'What port?' };
    render(<QuestionPanel question={question} client={value} />);

    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveFocus();
  });

  it('cycles Tab and ArrowLeft/ArrowRight between the answer buttons, wrapping around', async () => {
    const user = userEvent.setup();
    const { value } = client();
    const question: PendingQuestionView = {
      id: 'question-7', tab: 'build', kind: 'approve', question: 'Deploy to prod?', options: ['Yes', 'No'],
    };
    render(<QuestionPanel question={question} client={value} />);
    const yes = screen.getByRole('button', { name: 'Yes' });
    const no = screen.getByRole('button', { name: 'No' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(cancel).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(yes).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(no).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(cancel).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(no).toHaveFocus();
  });

  it('moves from Submit to Cancel with one Tab after tabbing out of the answer field, then wraps', async () => {
    const user = userEvent.setup();
    const { value } = client();
    const question: PendingQuestionView = { id: 'question-9', tab: 'build', kind: 'ask', question: 'Your name?' };
    render(<QuestionPanel question={question} client={value} />);
    const submit = screen.getByRole('button', { name: 'Submit' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(submit).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(cancel).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(submit).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(cancel).toHaveFocus();
  });

  it('continues from a clicked button rather than from where Tab last left the row', async () => {
    const user = userEvent.setup();
    const { value } = client();
    const question: PendingQuestionView = {
      id: 'question-10', tab: 'build', kind: 'approve', question: 'Deploy to prod?', options: ['Yes', 'No'],
    };
    render(<QuestionPanel question={question} client={value} />);
    const no = screen.getByRole('button', { name: 'No' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    no.focus();
    await user.keyboard('{Tab}');
    expect(cancel).toHaveFocus();
  });

  it('exposes focusCancel via the imperative handle, regardless of question kind', () => {
    const { value } = client();
    const question: PendingQuestionView = { id: 'question-8', tab: 'build', kind: 'ask', question: 'What port?' };
    const ref = createRef<QuestionPanelHandle>();
    render(<QuestionPanel ref={ref} question={question} client={value} />);

    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveFocus();
    ref.current?.focusCancel();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});
