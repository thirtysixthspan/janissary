import React, { useRef, useState } from 'react';
import { CommandBarShell, useCommandBarKeys } from '../api';

// How many statements the console recalls. Long enough to walk back through a session of
// experimenting, short enough that the recall walk stays instant.
const HISTORY_LIMIT = 50;

export type SqlConsoleProperties = {
  // Whether this tab is the visible one in its pane. A plugin tab stays mounted while hidden, so the
  // input only claims focus on mount when the tab is actually on screen.
  active: boolean;
  busy: boolean;
  // The text in the field, held by the frame rather than here, so the drawer's Run can put a
  // statement in the console as well as send it — a filtered grid is meant to be the starting point
  // of a hand-written query, and a statement that only executes is not one.
  value: string;
  onValue(next: string): void;
  onSend(sql: string): void;
};

// The SQL console: the host's own command bar, so it looks and behaves like every other line of text
// in the application, and Shift+Enter still starts a new line. Enter sends whatever is typed, and the
// host decides whether that was a read or a write using the same test `db sqlite query` uses — so
// the console is the escape hatch for a schema change, not a second grid.
export function SqlConsole({ active, busy, value, onValue, onSend }: SqlConsoleProperties) {
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = (text: string) => {
    setHistory((previous) => [text, ...previous.filter((entry) => entry !== text)].slice(0, HISTORY_LIMIT));
    onSend(text);
  };

  const bar = useCommandBarKeys({ value, setValue: onValue, inputRef, history, onSubmit: send });

  return (
    <CommandBarShell
      value={value}
      onChange={onValue}
      onKeyDown={bar.onKeyDown}
      inputRef={inputRef}
      ghost={bar.ghost}
      busy={busy}
      autoFocus={active}
      ariaLabel="SQL"
    />
  );
}
