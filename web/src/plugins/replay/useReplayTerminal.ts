import { useEffect, useMemo, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { isMacPlatform, terminalColors, type TabPluginClientCapabilities } from '../api';
import type { CastEvent, CastHeader } from './cast-stream';

// The replayed terminal, built by the plugin's own chunk rather than by the host's shared hook: a
// concrete client plugin reaches only its own API, the shared plugin stylesheet, and its own contract,
// and a replay has no PTY to attach to in any case — which is the whole difference between them.
//
// The recorded grid is authoritative. There is no fit addon, because fitting is exactly what must not
// happen: a recording is 120 columns because the session ran in 120 columns, and re-fitting that to
// whatever the pane happens to be rewraps output the session never produced that way. The font is
// scaled instead, from the cell size xterm reports itself, so the grid stays what was recorded while
// the text stays crisp — and pointer coordinates stay honest, which is what makes selecting text in a
// replay and copying it possible at all.
export type ReplayTerminal = {
  renderUpTo(events: readonly CastEvent[], time: number): void;
};

const BASE_FONT_SIZE = 13.5;
const MIN_FONT_SIZE = 6;

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
    const term = new Terminal({
      cols: header.cols,
      rows: header.rows,
      cursorBlink: false,
      theme: { background: palette.bg, foreground: palette.fg },
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim()
        || 'monospace',
      fontSize: BASE_FONT_SIZE,
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
    const refit = () => {
      const screen = container.querySelector<HTMLElement>('.xterm-screen');
      if (!screen || screen.offsetWidth === 0) return;
      const scale = Math.min(
        container.clientWidth / screen.offsetWidth,
        container.clientHeight / screen.offsetHeight,
        1,
      );
      term.options.fontSize = Math.max(MIN_FONT_SIZE, BASE_FONT_SIZE * scale);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(container);
    refit();
    return () => {
      termRef.current = null;
      observer.disconnect();
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
