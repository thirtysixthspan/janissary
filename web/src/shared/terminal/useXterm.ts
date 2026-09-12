import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { JanusClient } from '../../ws';
import { altArrowSequence, copySelectionChord, isMacPlatform, shiftEnterSequence } from './terminal-keys';
import { osc52ClipboardText } from './terminal-osc52';
import { copyText } from '../system-clipboard';
import { registerTerminalSelection, unregisterTerminalSelection } from './terminal-selection';

type UseXtermOptions = {
  ptyId: string;
  client: JanusClient;
  containerRef: React.RefObject<HTMLDivElement | null>;
  keyFilter?: (e: KeyboardEvent) => boolean;
  onMount?: (term: Terminal) => void;
};

// Shared xterm.js setup used by TerminalCard and HarnessTab. Creates a Terminal + FitAddon,
// attaches the PTY stream, forwards input, and observes container resizes.
// Returns a stable `focus` function that forwards to the live terminal.
export function useXterm({ ptyId, client, containerRef, keyFilter, onMount }: UseXtermOptions): () => void {
  const termRef = useRef<Terminal | null>(null);
  // Keep a ref to the latest filter so the handler closure never goes stale.
  const keyFilterRef = useRef(keyFilter);
  keyFilterRef.current = keyFilter;

  useEffect(() => {
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();
    const term = new Terminal({
      fontFamily: fontFamily || 'monospace', fontSize: 13.5, lineHeight: 1.2, cursorBlink: true,
      theme: { background: '#17181b', foreground: '#e4e5e7' },
      // A harness turns on mouse reporting the moment it starts, which switches xterm's selection
      // service off so the program owns the mouse. Every emulator keeps a modifier that forces a
      // selection anyway; xterm's is Shift off macOS, and Option on it — but only once this is set.
      // Without it macOS has no gesture that selects harness output, so nothing can be copied.
      macOptionClickForcesSelection: true,
    });
    termRef.current = term;
    const container = containerRef.current;
    if (container) registerTerminalSelection(container, term);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    try { fit.fit(); } catch { /* not laid out yet */ }

    const syncSize = () => {
      try {
        fit.fit();
        client.send({ method: 'ptyResize', params: { id: ptyId, cols: term.cols, rows: term.rows } });
      } catch { /* ignore */ }
    };
    syncSize();

    const detach = client.attachPty(ptyId, (data) => term.write(data));
    const onInput = term.onData((data) => client.send({ method: 'ptyInput', params: { id: ptyId, data } }));
    const sendKey = (data: string) => client.send({ method: 'ptyInput', params: { id: ptyId, data } });
    const isMac = isMacPlatform();
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const shiftEnter = shiftEnterSequence(e);
      if (shiftEnter !== null) {
        sendKey(shiftEnter);
        return false;
      }
      if (keyFilterRef.current && !keyFilterRef.current(e)) return false;
      // Only claimed while something is selected, so Ctrl+C stays the harness's interrupt and a
      // selection-less Cmd+C reaches it unchanged.
      if (copySelectionChord(e, isMac) && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      const wordMotion = altArrowSequence(e, isMac);
      if (wordMotion !== null) {
        sendKey(wordMotion);
        return false;
      }
      return true;
    });

    // A program that copies something on the machine it runs on cannot reach the clipboard of the
    // person watching it from another one, so it asks the terminal to do it instead. Without this
    // the request is parsed and dropped, and a remote harness's copy silently does nothing.
    const osc52 = term.parser.registerOscHandler(52, (data) => {
      const text = osc52ClipboardText(data);
      if (text !== null) copyText(text);
      return true;
    });

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(containerRef.current!);

    onMount?.(term);

    return () => {
      termRef.current = null; detach(); onInput.dispose(); osc52.dispose(); ro.disconnect(); term.dispose();
      if (container) unregisterTerminalSelection(container);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyFilterRef carries the latest filter; setup callbacks apply per PTY/client
  }, [ptyId, client]);

  return useCallback(() => termRef.current?.focus(), []);
}
