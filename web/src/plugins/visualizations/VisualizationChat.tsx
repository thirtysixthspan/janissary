import React, { useRef, useState } from 'react';
import { CommandBarShell, renderMarkdown, useCommandBarKeys, useStickToBottom } from '../api';
import type { VisualizationTurn } from '@shared/plugins/visualizations/shared';

// The conversation a visualization is. It is a conversation about its charts rather than a fresh one, so
// it reuses the same command bar, the same history recall, and the same stick-to-bottom rule an agent
// tab's does — and the same refusal while a reply is in flight, with the typed text left in place.
//
// A visualization nobody has started yet shows one line asking for an address, because the whole of what
// it needs to begin is one: a data file, or a page describing an API. It is the tab's own copy rather
// than a first turn, so a user who opens the tab and closes it again leaves no conversation behind.

export const PROMPT_LINE = 'Paste the URL of a data file, or of a page that describes an API, and tell me what you would like to see.';

export type ChatProperties = {
  turns: VisualizationTurn[];
  // Two to four requests the model offered about what it has just said or drawn, shown as one-click
  // modifications. The row disappears the moment one is used, so it never grows.
  followUps?: string[];
  // The last thing that went wrong, shown above the composer so a failed read is not mistaken for a
  // chart that simply drew nothing.
  error?: string;
  prompted: boolean;
  busy: boolean;
  disabled: boolean;
  active: boolean;
  onSend: (query: string) => void;
  onCancel: () => void;
};

export function VisualizationChat({
  turns, followUps, error, prompted, busy, disabled, active, onSend, onCancel,
}: ChatProperties) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnsRef = useRef<HTMLDivElement>(null);
  const rePinKey = turns.map((turn) => `${turn.query}${turn.response}`).join(' ');
  const { onScroll } = useStickToBottom(turnsRef, active, rePinKey);
  // This conversation's own past queries, oldest first, which is what ArrowUp walks back through. A
  // live-update turn carries no query of its own and is skipped, or the recall would stop on an empty
  // string and look broken rather than simply having nothing there.
  const history = turns.map((turn) => turn.query).filter((query) => query !== '');
  const bar = useCommandBarKeys({ value: query, setValue: setQuery, inputRef, history, onSubmit: onSend });

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (busy) onCancel();
      else setQuery('');
      return;
    }
    // A second message is refused while a reply is in flight, and refusing it must leave the typed text
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
        <p className="visualization-chat-empty">
          {prompted ? PROMPT_LINE : 'Ask for a change to a chart.'}
        </p>
      ) : (
        <div className="visualization-chat" ref={turnsRef} onScroll={(event) => { onScroll(event.currentTarget); }}>
          {turns.map((turn, index) => (
            <div key={`${turn.query}-${index}`} className="visualization-chat-turn">
              <p className="visualization-chat-query">{turn.query}</p>
              <div
                className="visualization-chat-response"
                // The model's reply is Markdown, sanitized by the shared renderer, which is the same
                // one a conversation's response goes through. It is never rendered as raw model text.
                // A failure is a line of this rather than a second field beside it: `agent.fail` writes
                // a readable sentence into the response, so a turn has one place to say what happened.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.response) ?? '' }}
              />
            </div>
          ))}
        </div>
      )}
      {error === undefined ? null : <p className="visualization-reason-note">{error}</p>}
      {/* The interview's own suggestion markup and classes, not a second implementation of them: a row of
          suggestions is a row of suggestions, whichever reply asked for it. Hidden while a reply is in
          flight, because a button that does nothing while the model works is worse than no button. */}
      {followUps !== undefined && followUps.length > 0 && !busy ? (
        <div className="visualization-suggestions visualization-follow-ups">
          {followUps.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="visualization-suggestion"
              disabled={disabled}
              onClick={() => { onSend(suggestion); }}
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
        ariaLabel="Ask about the data or the chart"
      />
    </>
  );
}
