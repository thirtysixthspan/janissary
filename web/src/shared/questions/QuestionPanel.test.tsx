import React, { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingQuestionView } from '@shared/protocol';
import { CUSTOM_ANSWER_LABEL } from '@shared/shared/question-choice';
import type { JanusClient } from '../ws/ws';
import { QuestionPanel } from './QuestionPanel';
import type { QuestionPanelHandle } from '../tab/handles';

function client() {
  const send = vi.fn();
  return { value: { send } as unknown as JanusClient, send };
}

function chooseQuestion(overrides: Partial<PendingQuestionView> = {}): PendingQuestionView {
  return {
    id: 'question-choose',
    tab: 'build',
    kind: 'choose',
    question: 'Pick one',
    choices: [
      { label: 'First', description: 'The first option' },
      { label: 'Second', description: 'The second option' },
    ],
    ...overrides,
  };
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

  it.each([
    {
      kind: 'ask',
      question: { id: 'question-11', tab: 'build', kind: 'ask', question: 'What port?' } as PendingQuestionView,
      role: 'textbox',
      name: 'Answer',
    },
    {
      kind: 'approve',
      question: { id: 'question-12', tab: 'build', kind: 'approve', question: 'Deploy to prod?', options: ['Yes', 'No'] } as PendingQuestionView,
      role: 'button',
      name: 'Cancel',
    },
    {
      kind: 'choose',
      question: chooseQuestion({ id: 'question-14' }),
      role: 'radio',
      name: 'First',
    },
  ])('Escape on a $kind question sends answer: null and stops propagation', ({ question, role, name }) => {
    const globalKeyDown = vi.fn();
    globalThis.addEventListener('keydown', globalKeyDown);
    try {
      const { value, send } = client();
      render(<QuestionPanel question={question} client={value} />);
      const target = screen.getByRole(role, { name });
      target.focus();
      fireEvent.keyDown(target, { key: 'Escape' });
      expect(send).toHaveBeenCalledWith({
        method: 'answerQuestion',
        params: { tab: question.tab, id: question.id, answer: null },
      });
      expect(globalKeyDown).not.toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener('keydown', globalKeyDown);
    }
  });

  it.each([
    { composition: 'isComposing', eventInit: { isComposing: true } },
    { composition: 'keyCode 229', eventInit: { keyCode: 229 } },
  ])('Escape during IME composition ($composition) on the ask textbox does not answer', ({ eventInit }) => {
    const globalKeyDown = vi.fn();
    globalThis.addEventListener('keydown', globalKeyDown);
    try {
      const { value, send } = client();
      const question: PendingQuestionView = {
        id: 'question-13', tab: 'build', kind: 'ask', question: 'What port?',
      };
      render(<QuestionPanel question={question} client={value} />);
      const target = screen.getByRole('textbox', { name: 'Answer' });
      target.focus();
      fireEvent.keyDown(target, { key: 'Escape', ...eventInit });
      expect(send).not.toHaveBeenCalled();
      expect(globalKeyDown).toHaveBeenCalledOnce();
    } finally {
      globalThis.removeEventListener('keydown', globalKeyDown);
    }
  });

  it('keeps the controls reachable through a pointer-transparent layer', () => {
    const { value } = client();
    const question: PendingQuestionView = { id: 'question-fit', tab: 'build', kind: 'ask', question: 'What port?' };
    const { container } = render(<QuestionPanel question={question} client={value} />);

    expect(container.querySelector('.question-panel-layer')).toHaveStyle({ pointerEvents: 'none' });
    expect(container.querySelector('.question-panel')).toHaveStyle({ pointerEvents: 'auto' });
    expect(container.querySelector('.question-panel-body')).toContainElement(screen.getByText('What port?'));
    const footer = container.querySelector('.question-panel-footer');
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Submit' }));
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('keeps the question text visible and scrollable when a tall footer fills a short layer', () => {
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { observers.push(callback); }
      observe() {}
      disconnect() {}
    });
    try {
      const { value } = client();
      const question: PendingQuestionView = {
        id: 'question-fit-overflow', tab: 'build', kind: 'approve',
        question: 'Deploy to prod?', options: ['Yes', 'No', 'Later', 'Never'],
      };
      const { container } = render(<QuestionPanel question={question} client={value} />);
      const layer = container.querySelector<HTMLElement>('.question-panel-layer')!;
      const panel = container.querySelector<HTMLElement>('.question-panel')!;
      const title = container.querySelector<HTMLElement>('.modal-title')!;
      const footer = container.querySelector<HTMLElement>('.question-panel-footer')!;

      Object.defineProperties(layer, {
        clientWidth: { configurable: true, value: 400 },
        clientHeight: { configurable: true, value: 200 },
      });
      Object.defineProperties(title, { offsetHeight: { configurable: true, value: 20 } });
      Object.defineProperties(footer, { offsetHeight: { configurable: true, value: 175 } });
      Object.defineProperties(panel, { scrollHeight: { configurable: true, value: 220 } });

      act(() => { observers[0]([], {} as ResizeObserver); });

      expect(panel).toHaveStyle({ height: '200px', overflowY: 'auto' });
      expect(panel).toHaveClass('question-panel--overflow');
      expect(container.querySelector('.question-panel-body')).toContainElement(screen.getByText('Deploy to prod?'));
      expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
      const theme = readFileSync('web/src/theme.css', 'utf8');
      expect(theme).toContain('.question-panel--overflow .question-panel-content { flex: none; }');
      expect(theme).toContain('.question-panel--overflow .question-panel-body { flex: none; }');
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('preselects the default choice, enables Submit, and submits the listed label verbatim', async () => {
    const { value, send } = client();
    render(<QuestionPanel question={chooseQuestion({ defaultOption: 'First' })} client={value} />);

    expect(screen.getByRole('radio', { name: 'First' })).toBeChecked();
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-choose', answer: 'First' },
    });
  });

  it('renders a first choice with no default and disables Submit until one is selected', () => {
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    expect(screen.getByRole('radio', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Second' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('shows each choice description beneath its label', () => {
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    expect(screen.getByText('The first option')).toBeInTheDocument();
    expect(screen.getByText('The second option')).toBeInTheDocument();
  });

  it('submits the typed alternative trimmed', async () => {
    const { value, send } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    await userEvent.click(screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL }));
    await userEvent.type(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL }), '  my answer  ');
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-choose', answer: 'my answer' },
    });
  });

  it('keeps typed alternative text while switching selections', async () => {
    const { value, send } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    const custom = screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL });
    const field = screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL });
    await userEvent.click(custom);
    await userEvent.type(field, 'draft');
    await userEvent.click(screen.getByRole('radio', { name: 'First' }));
    expect(field).toHaveValue('draft');
    await userEvent.click(custom);
    expect(field).toHaveValue('draft');

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-choose', answer: 'draft' },
    });
  });

  it('sends no answer while nothing valid is selected', async () => {
    const { value, send } = client();
    const { container } = render(<QuestionPanel question={chooseQuestion()} client={value} />);

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(send).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL }));
    await userEvent.type(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL }), ' '.repeat(3));
    expect(submit).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(send).not.toHaveBeenCalled();
  });

  it('names the radio group after the question and the custom field after its label', () => {
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL })).toBeInTheDocument();
  });

  it('focuses the first choice on open when no default is selected', () => {
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    expect(screen.getByRole('radio', { name: 'First' })).toHaveFocus();
  });

  it('focuses Submit on open when a default is selected', () => {
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion({ defaultOption: 'First' })} client={value} />);

    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();
  });

  it('selects the custom alternative when its text field is typed into', async () => {
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    await userEvent.type(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL }), 'my answer');

    expect(screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('wraps Tab from Cancel into the radio group and Shift+Tab back to Cancel', async () => {
    const user = userEvent.setup();
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);
    const first = screen.getByRole('radio', { name: 'First' });
    const second = screen.getByRole('radio', { name: 'Second' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(first).toHaveFocus();
    cancel.focus();
    await user.keyboard('{Tab}');
    expect(first).toHaveFocus();

    await user.click(second);
    cancel.focus();
    await user.keyboard('{Tab}');
    expect(second).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(cancel).toHaveFocus();
  });

  it('keeps focus in the group on arrow selection but moves it to the field on Space', async () => {
    const user = userEvent.setup();
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);
    const custom = screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL });
    const field = screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL });

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(custom).toHaveFocus();
    expect(custom).toBeChecked();
    expect(field).not.toHaveFocus();

    fireEvent.keyUp(custom, { key: ' ' });
    expect(field).toHaveFocus();
  });

  it('moves focus to the custom field on a pointer click on its radio', async () => {
    const user = userEvent.setup();
    const { value } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    await user.click(screen.getByRole('radio', { name: CUSTOM_ANSWER_LABEL }));

    expect(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL })).toHaveFocus();
  });

  it('submits the selected choice on Enter over a radio', () => {
    const { value, send } = client();
    render(<QuestionPanel question={chooseQuestion({ defaultOption: 'First' })} client={value} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'First' }), { key: 'Enter' });

    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-choose', answer: 'First' },
    });
  });

  it('submits the typed alternative on Enter in the custom field', async () => {
    const user = userEvent.setup();
    const { value, send } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    await user.type(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL }), 'my answer{Enter}');

    expect(send).toHaveBeenCalledWith({
      method: 'answerQuestion',
      params: { tab: 'build', id: 'question-choose', answer: 'my answer' },
    });
  });

  it('does not submit on Enter while Submit is disabled', async () => {
    const user = userEvent.setup();
    const { value, send } = client();
    render(<QuestionPanel question={chooseQuestion()} client={value} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'First' }), { key: 'Enter' });
    const field = screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL });
    await user.type(field, '   {Enter}');

    expect(send).not.toHaveBeenCalled();
  });

  it('restores first-choice focus and clears typed text when the panel is remounted', async () => {
    const { value } = client();
    const question = chooseQuestion();
    const firstRender = render(<QuestionPanel question={question} client={value} />);
    await userEvent.type(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL }), 'draft');
    expect(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL })).toHaveValue('draft');

    firstRender.unmount();
    render(<QuestionPanel question={question} client={value} />);

    expect(screen.getByRole('radio', { name: 'First' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: CUSTOM_ANSWER_LABEL })).toHaveValue('');
  });

  it('restores Submit focus after a remount when a default is present', () => {
    const { value } = client();
    const question = chooseQuestion({ defaultOption: 'Second' });
    const firstRender = render(<QuestionPanel question={question} client={value} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();

    firstRender.unmount();
    render(<QuestionPanel question={question} client={value} />);

    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Second' })).toBeChecked();
  });
});
