import React, { useRef, useState } from 'react';
import type { JanusClient } from './ws';
import type { TerminalEntry } from '@shared/protocol';
import { useXterm } from './useXterm';

type Properties = { entry: TerminalEntry; client: JanusClient };

// App-level chords (Shift/Ctrl+Arrow for tab switch/reorder, Ctrl+T for collapse) must reach the
// window handler rather than the PTY so tab switching still works while a card is focused.
function cardKeyFilter(e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  return !(e.shiftKey || e.ctrlKey);
}

// An inline xterm.js card hosting one PTY (an interactive program or AI harness). It lives in the
// transcript flow; "maximize" pops it to fill the window. On exit it freezes (input detached) so
// scrolling back still shows the session. App-level chords (Shift+Arrow, Ctrl+T) are not consumed
// by the terminal — they bubble to the window handler so tab switching still works while focused.
export function TerminalCard({ entry, client }: Properties) {
  const hostReference = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);

  useXterm({
    ptyId: entry.ptyId,
    client,
    containerRef: hostReference,
    keyFilter: cardKeyFilter,
  });

  const isExited = entry.status === 'exited';
  return (
    <div className={`terminal-card${maximized ? ' maximized' : ''}`}>
      <div className="head">
        <span className="name">▸{entry.program}</span>
        <span className={`status${isExited ? ' exited' : ''}`}>
          {isExited ? `exited${entry.exitCode === undefined ? '' : ` (${entry.exitCode})`}` : 'running'}
        </span>
        <span className="spacer" />
        <button onClick={() => setMaximized((m) => !m)}>{maximized ? 'restore' : 'maximize'}</button>
        {!isExited && <button onClick={() => client.send({ method: 'ptyKill', params: { id: entry.ptyId } })}>kill</button>}
      </div>
      <div className="body" ref={hostReference} onClick={() => { /* xterm handles focus on click */ }} />
    </div>
  );
}
