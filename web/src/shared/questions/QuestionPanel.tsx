import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { PendingQuestionView } from '@shared/protocol';
import type { JanusClient } from '../ws/ws';
import { ModalDialog } from '../ModalDialog';
import { useAnswerButtons } from './useAnswerButtons';
import { ChoiceQuestionForm } from './ChoiceQuestionForm';
import type { QuestionPanelHandle } from '../tab/handles';
import { useQuestionPanelFit } from './useQuestionPanelFit';

export const QuestionPanel = forwardRef<QuestionPanelHandle, {
  question: PendingQuestionView;
  client: JanusClient;
  onBeforeRemove?: (hadFocus: boolean) => void;
  pane?: 'right';
}>(function QuestionPanel({ question, client, onBeforeRemove, pane }, ref) {
  const [answer, setAnswer] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const optionCount = (question.options?.length ?? 0) + 1;
  const options = useAnswerButtons(optionCount);
  const askButtons = useAnswerButtons(2);

  useQuestionPanelFit({ layerRef, panelRef: dialogRef, questionId: question.id });

  useImperativeHandle(ref, () => ({ focusCancel: () => cancelRef.current?.focus() }), []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !onBeforeRemove) return;
    // Layout cleanup runs before removing the focused element resets focus to the body.
    return () => { onBeforeRemove(dialog.contains(dialog.ownerDocument.activeElement)); };
  }, [onBeforeRemove]);

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
    <div
      className="question-panel-layer"
      ref={layerRef}
      style={{ gridColumn: pane === 'right' ? 2 : 1, gridRow: 2, pointerEvents: 'none' }}
    >
      <ModalDialog dialogRef={dialogRef} title={`Question from ${question.tab}`} modal={false} className="question-panel">
        <div
          className="question-panel-content"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (event.key !== 'Escape') return;
            respond(null);
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="question-panel-body">
            <div className="question-panel-text">{question.question}</div>
          </div>
          <div className="question-panel-footer">
            {question.kind === 'ask' ? (
              <form
                className="question-panel-form"
                data-claims-shift-tab
                onSubmit={(event) => {
                  event.preventDefault();
                  respond(answer);
                }}
              >
                <input
                  aria-label="Answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={askButtons.onFieldKeyDown}
                  autoFocus
                />
                <div className="modal-actions" onKeyDown={askButtons.onKeyDown}>
                  <button className="modal-button" type="submit" ref={askButtons.getRef(0)}>Submit</button>
                  <button className="modal-button" type="button" ref={(el) => { askButtons.getRef(1)(el); cancelRef.current = el; }} onClick={() => respond(null)}>Cancel</button>
                </div>
              </form>
            ) : question.kind === 'approve' ? (
              <div className="question-panel-options" data-claims-shift-tab onKeyDown={options.onKeyDown}>
                {question.options?.map((option, i) => (
                  <button className="modal-button" type="button" key={option} ref={options.getRef(i)} onClick={() => respond(option)}>
                    {option}
                  </button>
                ))}
                <button className="modal-button" type="button" ref={(el) => { options.getRef(optionCount - 1)(el); cancelRef.current = el; }} onClick={() => respond(null)}>Cancel</button>
              </div>
            ) : (
              <ChoiceQuestionForm
                key={question.id}
                question={question}
                onSubmit={(answer) => respond(answer)}
                onCancel={() => respond(null)}
              />
            )}
          </div>
        </div>
      </ModalDialog>
    </div>
  );
});
