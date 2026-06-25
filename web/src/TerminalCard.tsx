import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { JanusClient } from './ws';
import type { TerminalEntry } from './protocol';

type Properties = { entry: TerminalEntry; client: JanusClient };

// An inline xterm.js card hosting one PTY (an interactive program or AI harness). It lives in the
// transcript flow; "maximize" pops it to fill the window. On exit it freezes (input detached) so
// scrolling back still shows the session. App-level chords (Shift+Arrow, Ctrl+T) are not consumed
// by the terminal — they bubble to the window handler so tab switching still works while focused.
export function TerminalCard({ entry, client }: Properties) {
  const hostReference = useRef<HTMLDivElement>(null);
  const termReference = useRef<Terminal | null>(null);
  const fitReference = useRef<FitAddon | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'var(--mono)', fontSize: 13.5, cursorBlink: true,
      theme: { background: '#17181b', foreground: '#e4e5e7' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostReference.current!);
    termReference.current = term;
    fitReference.current = fit;
    try { fit.fit(); } catch { /* not laid out yet */ }

    const id = entry.ptyId;
    const syncSize = () => {
      try {
        fit.fit();
        client.send({ method: 'ptyResize', params: { id, cols: term.cols, rows: term.rows } });
      } catch { /* ignore */ }
    };
    syncSize();

    const detach = client.attachPty(id, (data) => term.write(data));
    const onInput = term.onData((data) => client.send({ method: 'ptyInput', params: { id, data } }));
    // Let app-level chords fall through to the window handler instead of the PTY.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      // Let app-level chords reach the window handler (Shift/Ctrl+Arrow for tab switch, scroll,
      // reorder; Ctrl+T for collapse) instead of sending them to the PTY.
      return !(event.shiftKey || event.ctrlKey);
    });

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(hostReference.current!);

    return () => { detach(); onInput.dispose(); ro.disconnect(); term.dispose(); };
  }, [entry.ptyId, client]);

  useEffect(() => {
    const t = setTimeout(() => { try { fitReference.current?.fit(); } catch { /* ignore */ } }, 0);
    return () => clearTimeout(t);
  }, [maximized]);

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
      <div className="body" ref={hostReference} onClick={() => termReference.current?.focus()} />
    </div>
  );
}
