import React, { useState } from 'react';
import type { VisualizationQuestion } from '@shared/plugins/visualizations/shared';

// One question the model asked, and the answer it has not had yet. A suggestion is a button because
// clicking one is how most questions get answered, and the field beside it is not optional: the useful
// answer is often none of the suggestions, and a question that could only be answered by picking from a
// list the model wrote is a question the user cannot refuse.
export type QuestionProperties = {
  question: VisualizationQuestion;
  index: number;
  total: number;
  busy: boolean;
  disabled: boolean;
  onAnswer: (answer: string) => void;
};

export function VisualizationQuestion({
  question, index, total, busy, disabled, onAnswer,
}: QuestionProperties) {
  const [text, setText] = useState('');
  const submit = () => {
    const answer = text.trim();
    if (answer === '') return;
    onAnswer(answer);
    setText('');
  };
  return (
    <div className="visualization-question">
      <p className="visualization-question-progress">Question {index + 1} of {total}</p>
      <p className="visualization-question-text">{question.question}</p>
      {question.suggestions.length > 0 ? (
        <div className="visualization-suggestions">
          {question.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="visualization-suggestion"
              disabled={busy || disabled}
              onClick={() => { onAnswer(suggestion); }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="visualization-answer"
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <input
          type="text"
          value={text}
          placeholder="Or answer in your own words"
          aria-label="Your answer"
          disabled={busy || disabled}
          onChange={(event) => { setText(event.target.value); }}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
        />
        <button type="submit" disabled={busy || disabled || text.trim() === ''}>Answer</button>
      </form>
    </div>
  );
}
