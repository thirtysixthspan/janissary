import React, { useEffect, useRef, useState } from 'react';
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
  // Text the conversation opened with — `Chat about this` pastes a selection into the composer
  // without sending. It seeds the state once, on mount, exactly as if typed; later payload updates
  // do not rewrite it.
  initialQuery?: string;
  onConsumeDraft?: () => void;
};

// A conversation's message input: the host's command bar, plus the one rule a conversation has that
// an agent tab does not. A second query is refused while a reply is in flight, and refusing it must
// leave the typed text where it is — so the guard sits ahead of the bar's own Enter handling rather
// than inside the send, which would clear the input on the way to doing nothing.
export function ConversationComposer({
  history, streaming, deleted, onSend, active, initialQuery, onConsumeDraft,
}: ConversationComposerProperties) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const pendingAcknowledgement = useRef(initialQuery !== undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bar = useCommandBarKeys({ value: query, setValue: setQuery, inputRef, history, onSubmit: onSend });

  useEffect(() => {
    if (!pendingAcknowledgement.current || !onConsumeDraft) return;
    pendingAcknowledgement.current = false;
    onConsumeDraft();
  }, [onConsumeDraft]);

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
