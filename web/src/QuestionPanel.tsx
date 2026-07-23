import React, { useState } from 'react';
import type { PendingQuestionView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ModalDialog } from './ModalDialog';

export function QuestionPanel({
  question,
  client,
}: {
  question: PendingQuestionView;
  client: JanusClient;
}) {
  const [answer, setAnswer] = useState('');
  const respond = (value: string | null) => {
    client.send({
      method: 'answerQuestion',
      params: { tab: question.tab, id: question.id, answer: value },
    });
  };

  return (
    <ModalDialog title={`Question from ${question.tab}`} modal={false} className="question-panel">
      <div className="question-panel-text">{question.question}</div>
      {question.kind === 'ask' ? (
        <form
          className="question-panel-form"
          onSubmit={(event) => {
            event.preventDefault();
            respond(answer);
          }}
        >
          <input
            aria-label="Answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            autoFocus
          />
          <div className="modal-actions">
            <button className="modal-button" type="submit">Submit</button>
            <button className="modal-button" type="button" onClick={() => respond(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="question-panel-options">
          {question.options?.map((option) => (
            <button className="modal-button" type="button" key={option} onClick={() => respond(option)}>
              {option}
            </button>
          ))}
          <button className="modal-button" type="button" onClick={() => respond(null)}>Cancel</button>
        </div>
      )}
    </ModalDialog>
  );
}
