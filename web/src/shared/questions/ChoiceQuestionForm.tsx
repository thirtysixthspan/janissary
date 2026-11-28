import React, { useEffect, useRef, useState } from 'react';
import type { PendingQuestionView } from '@shared/protocol';
import { CUSTOM_ANSWER_LABEL } from '@shared/shared/question-choice';

type Properties = {
  question: PendingQuestionView;
  onSubmit: (answer: string) => void;
  onCancel: () => void;
};

export function ChoiceQuestionForm({ question, onSubmit, onCancel }: Properties) {
  const [selection, setSelection] = useState(question.defaultOption);
  const [customText, setCustomText] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const customFieldRef = useRef<HTMLInputElement>(null);
  const focusedForRef = useRef<string | null>(null);

  const answer = selection === CUSTOM_ANSWER_LABEL ? customText.trim() : selection;

  useEffect(() => {
    if (focusedForRef.current === question.id) return;
    focusedForRef.current = question.id;
    if (answer) submitRef.current?.focus();
    else formRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
  }, [question.id, answer]);

  const onRadioKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      cancelRef.current?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const onCancelKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Tab' || event.shiftKey) return;
    event.preventDefault();
    const radios = formRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const checked = formRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    (checked ?? radios?.[0])?.focus();
  };

  return (
    <form
      ref={formRef}
      className="choice-question-form"
      data-claims-shift-tab
      onSubmit={(event) => {
        event.preventDefault();
        if (answer) onSubmit(answer);
      }}
    >
      <fieldset className="choice-question-fieldset">
        <legend className="choice-question-legend">{question.question}</legend>
        {question.choices?.map((choice) => (
          <div className="choice-question-row" key={choice.label}>
            <label className="choice-question-label">
              <input
                type="radio"
                name={question.id}
                value={choice.label}
                checked={selection === choice.label}
                onChange={() => setSelection(choice.label)}
                onKeyDown={onRadioKeyDown}
              />
              {choice.label}
            </label>
            {choice.description && (
              <div className="choice-question-description">{choice.description}</div>
            )}
          </div>
        ))}
        <div className="choice-question-row">
          <label
            className="choice-question-label"
            onClick={(event) => { if (event.detail > 0) customFieldRef.current?.focus(); }}
          >
            <input
              type="radio"
              name={question.id}
              value={CUSTOM_ANSWER_LABEL}
              checked={selection === CUSTOM_ANSWER_LABEL}
              onChange={() => setSelection(CUSTOM_ANSWER_LABEL)}
              onKeyDown={onRadioKeyDown}
              onKeyUp={(event) => { if (event.key === ' ') customFieldRef.current?.focus(); }}
            />
            {CUSTOM_ANSWER_LABEL}
          </label>
          <input
            ref={customFieldRef}
            className="choice-question-custom-field"
            aria-label={CUSTOM_ANSWER_LABEL}
            value={customText}
            onChange={(event) => {
              setCustomText(event.target.value);
              setSelection(CUSTOM_ANSWER_LABEL);
            }}
          />
        </div>
      </fieldset>
      <div className="modal-actions">
        <button className="modal-button" type="submit" disabled={!answer} ref={submitRef}>Submit</button>
        <button className="modal-button" type="button" ref={cancelRef} onClick={onCancel} onKeyDown={onCancelKeyDown}>Cancel</button>
      </div>
    </form>
  );
}
