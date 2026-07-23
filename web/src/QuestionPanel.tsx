import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PendingQuestionView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ModalDialog } from './ModalDialog';
import { useAnswerButtons } from './useAnswerButtons';

export type QuestionPanelHandle = { focusCancel(): void };

export const QuestionPanel = forwardRef<QuestionPanelHandle, {
  question: PendingQuestionView;
  client: JanusClient;
}>(function QuestionPanel({ question, client }, ref) {
  const [answer, setAnswer] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const optionCount = (question.options?.length ?? 0) + 1;
  const options = useAnswerButtons(optionCount, optionCount - 1);
  const askButtons = useAnswerButtons(2, 1);

  useImperativeHandle(ref, () => ({ focusCancel: () => cancelRef.current?.focus() }), []);

  useEffect(() => {
    if (question.kind === 'approve') cancelRef.current?.focus();
  }, [question.id, question.kind]);

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
          <div className="modal-actions" onKeyDown={askButtons.onKeyDown}>
            <button className="modal-button" type="submit" ref={askButtons.getRef(0)}>Submit</button>
            <button className="modal-button" type="button" ref={(el) => { askButtons.getRef(1)(el); cancelRef.current = el; }} onClick={() => respond(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="question-panel-options" onKeyDown={options.onKeyDown}>
          {question.options?.map((option, i) => (
            <button className="modal-button" type="button" key={option} ref={options.getRef(i)} onClick={() => respond(option)}>
              {option}
            </button>
          ))}
          <button className="modal-button" type="button" ref={(el) => { options.getRef(optionCount - 1)(el); cancelRef.current = el; }} onClick={() => respond(null)}>Cancel</button>
        </div>
      )}
    </ModalDialog>
  );
});
