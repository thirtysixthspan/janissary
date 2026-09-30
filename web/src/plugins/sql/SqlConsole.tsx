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
  // The text in the field, held by the frame rather than here, so it survives a re-read of the grid.
  value: string;
  onValue(next: string): void;
  onSend(sql: string): void;
};

// The SQL console: the host's own command bar, so it looks and behaves like every other line of text
// in the application, and Shift+Enter still starts a new line. Enter sends whatever is typed, and the
// host decides whether that was a read or a write using the same test `db sqlite query` uses — so
// the console is the escape hatch for a schema change, not a second grid.
//
// The prompt is labelled `SQL`, because a bare `>` in a tab full of grids reads as the application's
// own command line and this one is not that.
//
// The bar is also the only way back through what this tab has run: the shared keymap walks the
// console's own recall list on `ArrowUp` and `ArrowDown`, and nothing else keeps a record of it.
export function SqlConsole({
  active, busy, value, onValue, onSend,
}: SqlConsoleProperties) {
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Oldest first, which is the order the shared keymap's `history` is walked in: it steps back from
  // the end of the list, so a list kept newest-first recalled the oldest statement first. Keeping the
  // console's own state in the order its consumer documents costs nothing at the call site, where a
  // reversal would have to be repeated on every render to read the same list.
  const send = (text: string) => {
    setHistory((previous) => [...previous.filter((entry) => entry !== text), text].slice(-HISTORY_LIMIT));
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
      label={<>SQL</>}
    />
  );
}
