import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { JanusClient } from '../../ws';
import { altArrowSequence, copySelectionChord, isMacPlatform, shiftEnterSequence } from './terminal-keys';
import { osc52ClipboardText } from './terminal-osc52';
import { copyText } from '../system-clipboard';
import { registerTerminalSelection, unregisterTerminalSelection } from './terminal-selection';
import { useSelectionLayer } from './useSelectionLayer';

type UseXtermOptions = {
  ptyId: string;
  client: JanusClient;
  containerRef: React.RefObject<HTMLDivElement | null>;
  keyFilter?: (e: KeyboardEvent) => boolean;
  onMount?: (term: Terminal) => void;
  active?: boolean;
  exited?: boolean;
};

export type UseXtermResult = {
  focus: () => void;
  selection: ReturnType<typeof useSelectionLayer>;
};

// Shared xterm.js setup used by TerminalCard and HarnessTab. Creates a Terminal + FitAddon,
// attaches the PTY stream, forwards input, and observes container resizes.
// Returns a stable `focus` function that forwards to the live terminal, plus the Shift+drag
// selection layer's view and clear callback.
export function useXterm({ ptyId, client, containerRef, keyFilter, onMount, active, exited }: UseXtermOptions): UseXtermResult {
  const termRef = useRef<Terminal | null>(null);
  // Keep a ref to the latest filter so the handler closure never goes stale.
  const keyFilterRef = useRef(keyFilter);
  keyFilterRef.current = keyFilter;
  const selection = useSelectionLayer({ containerRef, termRef, inactive: active === false, exited });

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const fontFamily = styles.getPropertyValue('--mono').trim();
    // The terminal and the selection overlay above it both read the same custom properties, so a
    // frozen snapshot is provably laid out and painted with what the live screen has.
    const fontSize = Number(styles.getPropertyValue('--terminal-font-size')) || 13.5;
    const lineHeight = Number(styles.getPropertyValue('--terminal-line-height')) || 1.2;
    const theme = {
      background: styles.getPropertyValue('--terminal-bg').trim() || '#17181b',
      foreground: styles.getPropertyValue('--terminal-fg').trim() || '#e4e5e7',
    };
    const term = new Terminal({
      fontFamily: fontFamily || 'monospace', fontSize, lineHeight, cursorBlink: true,
      theme,
      // Selection comes from the Shift+drag layer above the terminal, so xterm's own
      // forcing-modifier drag (the old macOptionClickForcesSelection) stays off: leaving it set
      // would give macOS a second selection that the harness's redraws could revoke.
    });
    termRef.current = term;
    const container = containerRef.current;
    if (container) registerTerminalSelection(container, {
      // The layer answers first; with nothing held the emulator's own selection is still
      // readable, which is what keeps native drags on surfaces that never take the mouse working.
      hasSelection: () => selection.holds() || term.hasSelection(),
      getSelection: () => (selection.holds() ? selection.text() : term.getSelection()),
    });
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
      // selection-less Cmd+C reaches it unchanged. The layer answers before the emulator does, and
      // copying from the layer leaves the selection held — the same pick can be used twice.
      const layerHeld = selection.holds();
      if (copySelectionChord(e, isMac) && (layerHeld || term.hasSelection())) {
        void navigator.clipboard.writeText(layerHeld ? selection.text() : term.getSelection());
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

      // A resize leaves the selection anchored to a grid that no longer exists.
      const ro = new ResizeObserver(() => { selection.clear(); syncSize(); });
    ro.observe(containerRef.current!);

    onMount?.(term);

    return () => {
      termRef.current = null; detach(); onInput.dispose(); osc52.dispose(); ro.disconnect(); term.dispose();
      if (container) unregisterTerminalSelection(container);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyFilterRef carries the latest filter; setup callbacks apply per PTY/client
  }, [ptyId, client]);

  const focus = useCallback(() => termRef.current?.focus(), []);
  return useMemo(() => ({ focus, selection }), [focus, selection]);
}
