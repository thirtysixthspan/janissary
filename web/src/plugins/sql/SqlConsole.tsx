import React, { useState } from 'react';
import { CommandBarShell, useCommandBarKeys } from '../api';

// How many statements the console recalls. Long enough to walk back through a session of
// experimenting, short enough that the recall walk stays instant.
const HISTORY_LIMIT = 50;

export type SqlConsoleProperties = {
  // Whether this tab is the visible one in its pane. A plugin tab stays mounted while hidden, so the
  // input only claims focus on mount when the tab is actually on screen.
  active: boolean;
  busy: boolean;
  // The field, whose ref the frame holds so it can bring focus back here from the grid.
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  // The text in the field, held by the frame rather than here, so it survives a re-read of the grid.
  value: string;
  onValue(next: string): void;
  onSend(sql: string): void;
  /** Hand focus to the grid: a bare `Tab` leaves the bar for the other pane of this tab. */
  onLeave(): void;
};

// The SQL console: the host's own command bar, so it looks and behaves like every other line of text
// in the application, and Shift+Enter still starts a new line. Enter sends whatever is typed, and the
// host decides whether that was a read or a write using the same test `db sqlite query` uses — so
// the console is the escape hatch for a schema change, not a second grid.
//
// The prompt is labelled `SQL`, because a bare `>` in a tab full of grids reads as the application's
// own command line and this one is not that.
//
// Its keys are the shared keymap's, and they are the bar's own: `ArrowUp` and `ArrowDown` walk the
// console's recall list, `Enter` sends, `Shift+Enter` starts a line, and nothing pressed here also
// reaches the grid above. The one key the bar claims for itself is a bare `Tab`, which moves focus to
// the grid and comes back on the next one — the tab has two panes and this is how a user crosses to
// the other.
export function SqlConsole({
  active, busy, inputRef, value, onValue, onSend, onLeave,
}: SqlConsoleProperties) {
  const [history, setHistory] = useState<string[]>([]);

  // Oldest first, which is the order the shared keymap's `history` is walked in: it steps back from
  // the end of the list, so a list kept newest-first recalled the oldest statement first. Keeping the
  // console's own state in the order its consumer documents costs nothing at the call site, where a
  // reversal would have to be repeated on every render to read the same list.
  const send = (text: string) => {
    setHistory((previous) => [...previous.filter((entry) => entry !== text), text].slice(-HISTORY_LIMIT));
    onSend(text);
  };

  const bar = useCommandBarKeys({ value, setValue: onValue, inputRef, history, onSubmit: send });

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // A held modifier is never this key's: `Shift+Tab` is the host's, and it walks out of a plugin
    // tab whatever is focused inside it.
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      onLeave();
      return;
    }
    bar.onKeyDown(event);
  };

  return (
    <CommandBarShell
      value={value}
      onChange={onValue}
      onKeyDown={onKeyDown}
      inputRef={inputRef}
      ghost={bar.ghost}
      busy={busy}
      autoFocus={active}
      ariaLabel="SQL"
      label={<>SQL</>}
    />
  );
}
