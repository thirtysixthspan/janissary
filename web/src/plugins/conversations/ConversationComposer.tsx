import React, { useRef, useState } from 'react';
import { CommandBarShell, useCommandBarKeys } from '../api';

export type ConversationComposerProperties = {
  // This conversation's own past queries, oldest first: what ArrowUp walks back through and what the
  // ghost overlay completes from, the same way an agent tab recalls its own commands.
  history: string[];
  streaming: boolean;
  deleted: boolean;
  onSend: (query: string) => void;
  // Whether this tab is the visible one in its pane. A plugin tab stays mounted while hidden, so the
  // input only claims focus on mount when the tab is actually on screen.
  active: boolean;
};

// A conversation's message input: the host's command bar, plus the one rule a conversation has that
// an agent tab does not. A second query is refused while a reply is in flight, and refusing it must
// leave the typed text where it is — so the guard sits ahead of the bar's own Enter handling rather
// than inside the send, which would clear the input on the way to doing nothing.
export function ConversationComposer({
  history, streaming, deleted, onSend, active,
}: ConversationComposerProperties) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bar = useCommandBarKeys({ value: query, setValue: setQuery, inputRef, history, onSubmit: onSend });

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const submitting = event.key === 'Enter' && !event.shiftKey;
    if (submitting && streaming) { event.preventDefault(); return; }
    bar.onKeyDown(event);
  };

  return (
    <CommandBarShell
      value={query}
      onChange={setQuery}
      onKeyDown={onKeyDown}
      inputRef={inputRef}
      ghost={bar.ghost}
      busy={streaming}
      disabled={deleted}
      autoFocus={active}
      ariaLabel="Message"
    />
  );
}
