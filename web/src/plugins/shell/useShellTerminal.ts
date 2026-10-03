import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  registerTerminalSelection, terminalColors, unregisterTerminalSelection,
  type PluginTerminal,
} from '../api';

export type AttachTerminal = (
  ptyId: string, onData: (data: string) => void,
) => PluginTerminal;

type Options = {
  ptyId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  attachTerminal: AttachTerminal | undefined;
  // Called when the shell behind this terminal exits. A plugin tab has nowhere else to hear it: the
  // event is broadcast once, to whoever happened to be connected at the time.
  onExit: () => void;
};

// What the tab writes to the shell through. One attachment, created once here: resizing and typing
// both go out through this handle rather than opening a second one, which would double every byte
// the shell received and leave two subscriptions for the tab to leak.
export type ShellTerminalHandle = {
  write(data: string): void;
};

export function useShellTerminal({
  ptyId, containerRef, attachTerminal, onExit,
}: Options): ShellTerminalHandle {
  const handleRef = useRef<PluginTerminal | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  // `attachTerminal` is read through a ref rather than closed over, and deliberately kept out of the
  // effect's dependencies below. It arrives on a capability object the host rebuilds whenever the tab
  // becomes visible or hidden, so depending on its identity tore the emulator down and built a new one
  // on every tab switch — losing the buffer, and with it the scrollback, each time. Nothing about the
  // attachment changes when visibility does.
  const attachRef = useRef(attachTerminal);
  attachRef.current = attachTerminal;

  useEffect(() => {
    const container = containerRef.current;
    const attach = attachRef.current;
    // No container means the body has not been laid out yet, and no `attachTerminal` means this plugin
    // was given no way to reach a terminal. Either way there is nothing to open and nothing to clean up.
    if (!container || !attach) return;

    const styles = getComputedStyle(document.documentElement);
    const colors = terminalColors();
    const terminal = new Terminal({
      fontFamily: styles.getPropertyValue('--mono').trim() || 'monospace',
      fontSize: Number(styles.getPropertyValue('--terminal-font-size').replace('px', '')) || 13.5,
      lineHeight: Number(styles.getPropertyValue('--terminal-line-height').replace('px', '')) || 1.2,
      // A terminal that is never focused should not advertise a caret. The cursor belongs to the
      // command line, and two of them blinking on one screen reads as two places to type.
      cursorBlink: false,
      // The structural half of "nothing is typed in here directly": with stdin off the emulator has no
      // textarea to type into even if it were focused. The command line holds focus either way — see
      // the terminal's pointer handler in `ShellTab`.
      disableStdin: true,
      theme: { background: colors.bg, foreground: colors.fg },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    // One fit, once the attachment exists: fitting before it can do nothing useful, because the size
    // has nowhere to go until there is a process on the other end.
    const resize = () => {
      try { fit.fit(); } catch { /* not laid out yet */ }
      handleRef.current?.resize(terminal.cols, terminal.rows);
    };

    // The bridge the application's context menu reads to learn what a right-click landed on: a
    // terminal's selection is emulator state, so nothing else can tell it. Registering here is what
    // makes a native drag over the screen offer **Copy**.
    registerTerminalSelection(container, {
      hasSelection: () => terminal.hasSelection(),
      getSelection: () => terminal.getSelection(),
      clear: () => terminal.clearSelection(),
    });

    const observer = new ResizeObserver(() => {
      terminal.clearSelection();
      resize();
    });
    observer.observe(container);

    const handle = attach(ptyId, (data) => { terminal.write(data); });
    handleRef.current = handle;
    handle.onExit(() => { exitRef.current(); });
    resize();

    return () => {
      observer.disconnect();
      handle.detach();
      handleRef.current = null;
      unregisterTerminalSelection(container);
      terminal.dispose();
    };
  }, [ptyId, containerRef]);

  return {
    write: (data) => { handleRef.current?.write(data); },
  };
}