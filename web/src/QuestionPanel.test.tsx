import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingQuestionView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { QuestionPanel } from './QuestionPanel';

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
});
