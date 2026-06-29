import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { JanusClient } from './ws';

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
    });
    termRef.current = term;
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
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      return keyFilterRef.current ? keyFilterRef.current(e) : true;
    });

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(containerRef.current!);

    onMount?.(term);

    return () => { termRef.current = null; detach(); onInput.dispose(); ro.disconnect(); term.dispose(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId, client]);

  return useCallback(() => termRef.current?.focus(), []);
}
