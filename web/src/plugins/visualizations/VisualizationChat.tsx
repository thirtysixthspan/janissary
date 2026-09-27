import React, { useRef, useState } from 'react';
import { CommandBarShell, renderMarkdown, useCommandBarKeys, useStickToBottom } from '../api';
import type { VisualizationTurn } from '@shared/plugins/visualizations/shared';

// The exchange that changes the chart. It is a conversation about one chart rather than a fresh one, so
// it reuses the same command bar, the same history recall, and the same stick-to-bottom rule an agent
// tab's does — and the same refusal while a reply is in flight, with the typed text left in place.
export type ChatProperties = {
  turns: VisualizationTurn[];
  // Two to four requests the model offered about the chart it last produced, shown as one-click
  // modifications. The row disappears the moment one is used, so it never grows.
  followUps?: string[];
  busy: boolean;
  disabled: boolean;
  active: boolean;
  onRevise: (query: string) => void;
  onCancel: () => void;
};

export function VisualizationChat({
  turns, followUps, busy, disabled, active, onRevise, onCancel,
}: ChatProperties) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnsRef = useRef<HTMLDivElement>(null);
  const rePinKey = turns.map((turn) => `${turn.query}${turn.response}`).join(' ');
  const { onScroll } = useStickToBottom(turnsRef, active, rePinKey);
  const bar = useCommandBarKeys({ value: query, setValue: setQuery, inputRef, history: [], onSubmit: onRevise });

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (busy) onCancel();
      else setQuery('');
      return;
    }
    // A second query is refused while a reply is in flight, and refusing it must leave the typed text
    // where it is — so the guard sits ahead of the bar's own Enter handling.
    if (event.key === 'Enter' && !event.shiftKey && busy) {
      event.preventDefault();
      return;
    }
    bar.onKeyDown(event);
  };

  return (
    <>
      {turns.length === 0 ? (
        <p className="visualization-chat-empty">Ask for a change to the chart.</p>
      ) : (
        <div className="visualization-chat" ref={turnsRef} onScroll={(event) => { onScroll(event.currentTarget); }}>
          {turns.map((turn, index) => (
            <div key={`${turn.query}-${index}`} className="visualization-chat-turn">
              <p className="visualization-chat-query">{turn.query}</p>
              {turn.error ? (
                <p className="visualization-chat-error">{turn.error}</p>
              ) : (
                <div
                  className="visualization-chat-response"
                  // The model's reply is Markdown, sanitized by the shared renderer, which is the same
                  // one a conversation's response goes through. It is never rendered as raw model text.
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.response) ?? '' }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {/* The interview's own suggestion markup and classes, not a second implementation of them: a row of
          suggestions is a row of suggestions, whichever question asked for it. Hidden while a reply is in
          flight, because a button that does nothing while the model works is worse than no button. */}
      {followUps !== undefined && followUps.length > 0 && !busy ? (
        <div className="visualization-suggestions visualization-follow-ups">
          {followUps.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="visualization-suggestion"
              disabled={disabled}
              onClick={() => { onRevise(suggestion); }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <CommandBarShell
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
        ghost={bar.ghost}
        busy={busy}
        disabled={disabled}
        autoFocus={active}
        ariaLabel="Change the chart"
      />
    </>
  );
}
