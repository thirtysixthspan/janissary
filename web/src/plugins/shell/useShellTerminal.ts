import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  registerTerminalSelection, terminalColors, unregisterTerminalSelection,
  type PluginTerminal,
} from '../api';

const SHELL_STATUS_HOOKS = String.raw`export PROMPT='> '; autoload -Uz add-zsh-hook; _janus_preexec() { printf '\033]133;C\a'; }; _janus_emit_cwd() { printf '\033]7;file://%s%s\a' "$HOST" "$PWD"; }; _janus_precmd() { printf '\033]133;D\a'; _janus_emit_cwd; }; _janus_chpwd() { _janus_emit_cwd; }; add-zsh-hook preexec _janus_preexec; add-zsh-hook precmd _janus_precmd; add-zsh-hook chpwd _janus_chpwd; _janus_emit_cwd; printf '\033]133;E\a'
`;

export type AttachTerminal = (
  ptyId: string, onData: (data: string) => void,
) => PluginTerminal | Promise<PluginTerminal>;

type Options = {
  ptyId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  attachTerminal: AttachTerminal | undefined;
  onCommandRunning: (running: boolean) => void;
  onCwd: (cwd: string) => void;
  // Called when the shell behind this terminal exits. A plugin tab has nowhere else to hear it: the
  // event is broadcast once, to whoever happened to be connected at the time.
  onExit: () => void;
};

// What the tab writes to the shell through. One attachment, created once here: resizing and typing
// both go out through this handle rather than opening a second one, which would double every byte
// the shell received and leave two subscriptions for the tab to leak.
export type ShellTerminalHandle = {
  write(data: string): void;
  focus(): void;
  scrollLines(amount: number): void;
  scrollToBottom(): void;
  rows(): number;
};

function shellTerminalTheme() {
  const colors = terminalColors();
  return { background: colors.bg, foreground: colors.fg };
}

export function useShellTerminal({
  ptyId, containerRef, attachTerminal, onExit, onCommandRunning, onCwd,
}: Options): ShellTerminalHandle {
  const handleRef = useRef<PluginTerminal | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const runningRef = useRef(onCommandRunning);
  runningRef.current = onCommandRunning;
  const cwdRef = useRef(onCwd);
  cwdRef.current = onCwd;
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
    const terminal = new Terminal({
      fontFamily: styles.getPropertyValue('--mono').trim() || 'monospace',
      fontSize: Number(styles.getPropertyValue('--terminal-font-size').replace('px', '')) || 13.5,
      lineHeight: Number(styles.getPropertyValue('--terminal-line-height').replace('px', '')) || 1.2,
      cursorBlink: true,
      disableStdin: false,
      theme: shellTerminalTheme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    container.classList.add('shell-initializing');
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = shellTerminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    terminal.parser.registerOscHandler(133, (data) => {
      switch (data) {
      case 'C': { runningRef.current(true); break; }
      case 'D': { runningRef.current(false); break; }
      case 'E': {
        terminal.clear();
        container.classList.remove('shell-initializing');
        break;
      }
      }
      return ['C', 'D', 'E'].includes(data);
    });
    terminal.parser.registerOscHandler(7, (data) => {
      try {
        const url = new URL(data);
        if (url.protocol === 'file:') cwdRef.current(decodeURIComponent(url.pathname));
      } catch {
        return true;
      }
      return true;
    });
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

    terminalRef.current = terminal;
    let disposed = false;
    const onAttached = (handle: PluginTerminal) => {
      if (disposed) { handle.detach(); return; }
      handleRef.current = handle;
      terminal.onData((data) => { handleRef.current?.write(data); });
      handle.write(SHELL_STATUS_HOOKS);
      handle.onExit(() => { exitRef.current(); });
      resize();
    };
    const attachment = attach(ptyId, (data) => { terminal.write(data); });
    if (attachment instanceof Promise) {
      void attachment.then(onAttached).catch(() => { /* The server refused a terminal not owned by this tab. */ });
    } else {
      onAttached(attachment);
    }

    return () => {
      disposed = true;
      observer.disconnect();
      themeObserver.disconnect();
      handleRef.current?.detach();
      handleRef.current = null;
      terminalRef.current = null;
      unregisterTerminalSelection(container);
      terminal.dispose();
    };
  }, [ptyId, containerRef]);

  const write = useCallback((data: string) => { handleRef.current?.write(data); }, []);
  const focus = useCallback(() => { terminalRef.current?.focus(); }, []);
  const scrollLines = useCallback((amount: number) => { terminalRef.current?.scrollLines(amount); }, []);
  const scrollToBottom = useCallback(() => { terminalRef.current?.scrollToBottom(); }, []);
  const rows = useCallback(() => terminalRef.current?.rows ?? 0, []);
  return { write, focus, scrollLines, scrollToBottom, rows };
}
