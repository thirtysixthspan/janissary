import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import type { SqlConsoleResult } from '@shared/plugins/sql/shared';
import { CommandBarShell, useCommandBarKeys } from '../api';
import { isHistoryKey, nextHistoryRow, SqlHistory } from './SqlHistory';

// How many statements the console recalls. Long enough to walk back through a session of
// experimenting, short enough that the recall walk stays instant.
const HISTORY_LIMIT = 50;

export type SqlConsoleProperties = {
  // Whether this tab is the visible one in its pane. A plugin tab stays mounted while hidden, so the
  // input only claims focus on mount when the tab is actually on screen.
  active: boolean;
  busy: boolean;
  // What the tab has run, newest first, and what to do with an emptied log. The payload is the record:
  // this browser is the only surface that writes, so nothing else can hold it.
  log: readonly SqlConsoleResult[];
  onClearLog(): void;
  // The text in the field, held by the frame rather than here, so a picked statement lands in it as
  // well as being sent — a statement is always something the user can read and change before it runs.
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
// The history panel is the agent tab's `hist` picker and behaves like it: open or closed, the keys
// belong to it while it is open, and a picked row goes into the line rather than executing on the
// spot. It opens through the bar's own `above` slot — the one the agent bar's completion strip uses —
// so it sits where a picker in this application sits rather than where a drawer did.
export function SqlConsole({
  active, busy, log, onClearLog, value, onValue, onSend,
}: SqlConsoleProperties) {
  const [history, setHistory] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Oldest first, which is the order the shared keymap's `history` is walked in: it steps back from
  // the end of the list, so a list kept newest-first recalled the oldest statement first. Keeping the
  // console's own state in the order its consumer documents costs nothing at the call site, where a
  // reversal would have to be repeated on every render to read the same list.
  const send = (text: string) => {
    setHistory((previous) => [...previous.filter((entry) => entry !== text), text].slice(-HISTORY_LIMIT));
    onSend(text);
  };

  // A panel opened over an older log would land on a row that has changed under it, so the selection
  // starts at the newest each time rather than being remembered from the last time.
  const toggle = () => {
    setPicked(0);
    setOpen(!open);
  };

  const pick = (sql: string) => {
    setOpen(false);
    onValue(sql);
  };

  const bar = useCommandBarKeys({ value, setValue: onValue, inputRef, history, onSubmit: send });

  // While the panel is open it is modal, as the agent bar's picker is: the keys below are its, and the
  // baseline keymap — which would otherwise recall history on ArrowUp and submit on Enter — is not
  // consulted for them.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !isHistoryKey(event.key)) return bar.onKeyDown(event);
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      const entry = log[picked];
      if (entry) pick(entry.sql);
      else setOpen(false);
      return;
    }
    event.preventDefault();
    setPicked((from) => nextHistoryRow(log.length, from, event.key));
  };

  return (
    <div className="sql-console-bar">
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
        above={open ? (
          <SqlHistory
            log={log}
            selected={picked}
            onPick={pick}
            onClear={onClearLog}
          />
        ) : undefined}
      />
      <button
        type="button"
        className="sql-icon sql-history-toggle"
        title="Statement history"
        aria-label="Statement history"
        aria-expanded={open}
        onClick={toggle}
      >
        <FontAwesomeIcon icon={faClockRotateLeft} />
      </button>
    </div>
  );
}
