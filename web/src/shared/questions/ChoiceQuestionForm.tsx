import React, { useState } from 'react';
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

  const answer = selection === CUSTOM_ANSWER_LABEL ? customText.trim() : selection;

  return (
    <form
      className="choice-question-form"
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
              />
              {choice.label}
            </label>
            {choice.description && (
              <div className="choice-question-description">{choice.description}</div>
            )}
          </div>
        ))}
        <div className="choice-question-row">
          <label className="choice-question-label">
            <input
              type="radio"
              name={question.id}
              value={CUSTOM_ANSWER_LABEL}
              checked={selection === CUSTOM_ANSWER_LABEL}
              onChange={() => setSelection(CUSTOM_ANSWER_LABEL)}
            />
            {CUSTOM_ANSWER_LABEL}
          </label>
          <input
            className="choice-question-custom-field"
            aria-label={CUSTOM_ANSWER_LABEL}
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
          />
        </div>
      </fieldset>
      <div className="modal-actions">
        <button className="modal-button" type="submit" disabled={!answer}>Submit</button>
        <button className="modal-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
