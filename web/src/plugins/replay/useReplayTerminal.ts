import { useEffect, useMemo, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { isMacPlatform, terminalColors, type TabPluginClientCapabilities } from '../api';
import type { CastEvent, CastHeader } from './cast-stream';

// The replayed terminal, built by the plugin's own chunk rather than by the host's shared hook: a
// concrete client plugin reaches only its own API, the shared plugin stylesheet, and its own contract,
// and a replay has no PTY to attach to in any case — which is the whole difference between them.
//
// The recorded grid is authoritative, and nothing is scaled to make it fit. There is no fit addon,
// because fitting is exactly what must not happen: a recording is 120 columns because the session ran
// in 120 columns, and re-fitting that to whatever the pane happens to be rewraps output the session
// never produced that way. Nor is the font shrunk to fit — a recording viewed in a narrow sidebar is
// the same text at the same size as one viewed in the centre, and whatever falls outside the tab is
// clipped. Resizing the window is how a viewer sees a recording larger than their pane.
export type ReplayTerminal = {
  renderUpTo(events: readonly CastEvent[], time: number): void;
};

const FALLBACK_FONT_SIZE = 13.5;

export function useReplayTerminal(
  header: CastHeader | undefined,
  containerRef: React.RefObject<HTMLDivElement | null>,
  capabilities: TabPluginClientCapabilities,
): ReplayTerminal {
  const termRef = useRef<Terminal | null>(null);
  // How far the terminal has been fed, as an index into the timeline rather than a time: a seek that
  // runs forward would otherwise walk every event behind it again, which on a long recording at sixty
  // ticks a second is the difference between a few hundred operations and a few hundred thousand.
  const cursor = useRef({ index: 0, time: 0 });
  const isMac = useMemo(() => isMacPlatform(), []);

  useEffect(() => {
    const container = containerRef.current;
    // Nothing is built until the header says what grid to build: the recorded columns and rows are
    // the whole point of the tab, and a terminal built at any other size would have to be thrown away
    // and rebuilt — losing the bytes already written, since the cursor below is this hook's only
    // record of how far it got.
    if (!container || !header) return;
    const palette = header.colors ?? terminalColors();
    const styles = getComputedStyle(document.documentElement);
    // The app's own terminal font size, read the way `useXterm` reads it, so a replay in this tab is
    // the same text at the same size as the terminal beside it rather than a second scale of its own.
    const fontSize = Number(styles.getPropertyValue('--terminal-font-size').replace('px', ''))
      || FALLBACK_FONT_SIZE;
    const term = new Terminal({
      cols: header.cols,
      rows: header.rows,
      cursorBlink: false,
      theme: { background: palette.bg, foreground: palette.fg },
      fontFamily: styles.getPropertyValue('--mono').trim() || 'monospace',
      fontSize,
    });
    termRef.current = term;
    // A new terminal has been fed nothing, whatever a previous one had been fed.
    cursor.current = { index: 0, time: 0 };
    term.open(container);
    // Copying is the ordinary chord rather than the terminal's: there is no program behind this
    // terminal to interrupt, so Ctrl+C is free to mean what it means everywhere else.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || event.key.toLowerCase() !== 'c' || event.altKey) return true;
      if (event.shiftKey || (isMac ? !event.metaKey : !event.ctrlKey)) return true;
      const text = term.getSelection();
      if (!text) return true;
      capabilities.copyText(text);
      return false;
    });
    return () => {
      termRef.current = null;
      term.dispose();
    };
    // Built once per recording: its recorded size and colors are fixed for the recording's whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the terminal is one object for one recording: rebuilding it on a new options object or capability would tear down and re-create a terminal that is playing.
  }, [containerRef, header, isMac]);

  return useMemo<ReplayTerminal>(() => ({
    renderUpTo(events, time) {
      const term = termRef.current;
      if (!term) return;
      // A terminal is a state machine: there is no way to arrive at an earlier frame other than
      // having run the bytes before it, so a seek backwards resets and replays from the start.
      if (time < cursor.current.time) {
        term.reset();
        cursor.current = { index: 0, time: 0 };
      }
      for (let index = cursor.current.index; index < events.length; index++) {
        const event = events[index];
        if (event.time > time) break;
        if (event.code === 'o') {
          term.write(event.data);
        } else if (event.code === 'r') {
          try { term.resize(event.data.cols, event.data.rows); } catch { /* not laid out yet */ }
        }
        cursor.current = { index: index + 1, time: event.time };
      }
    },
  }), []);
}