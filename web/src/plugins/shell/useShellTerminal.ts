import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  copySelectionChord, isMacPlatform, registerTerminalSelection, terminalColors, unregisterTerminalSelection,
  type PluginTerminal, type TerminalColors,
} from '../api';
import { shellTerminalTheme } from './shell-terminal-theme';
import { registerShellMarkerHandlers } from './shell-marker-handlers';
import { insertMarkdownBlock } from './markdown-block';
import { attachPromptMask } from './prompt-mask';
import { formatDispatchedCommand } from './format-dispatched-command';
import { markdownToAnsi } from './markdown-to-ansi';
import { stripTerminalControls } from './strip-terminal-controls';

export type AttachTerminal = (
  ptyId: string, onData: (data: string) => void,
) => PluginTerminal | Promise<PluginTerminal>;

type Options = {
  // Absent while the shell's workspace clone is still landing: there is no terminal to attach yet,
  // and the attachment is made when the ready payload supplies one.
  ptyId: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  attachTerminal: AttachTerminal | undefined;
  copyText: (text: string) => void;
  // Reports this terminal's resolved colors for its session's recording, once, after it mounts. The
  // same report the host's own terminal surfaces make, and for the same reason: the values live only
  // in the web stylesheet, so a replay would otherwise be rendered under whatever theme is active
  // when it is watched rather than the one the session ran under.
  reportColors?: (id: string, colors: TerminalColors) => void;
  // Opens a link clicked in a rendered reply. Absent, a click on one still never navigates the window.
  openLink?: (href: string) => void;
  onCommandRunning: (running: boolean) => void;
  onCwd: (cwd: string) => void;
  onCommand?: (command: string) => void;
  // Called when the shell behind this terminal exits. A plugin tab has nowhere else to hear it: the
  // event is broadcast once, to whoever happened to be connected at the time.
  onExit: () => void;
  // The nonce zsh's startup files installed the hooks with, minted by the server with the shell. Read
  // once, at mount: every mount only attaches, and nothing is ever typed into the shell for it.
  hookNonce: string;
};

// What the tab writes to the shell through. One attachment, created once here: resizing and typing
// both go out through this handle rather than opening a second one, which would double every byte
// the shell received and leave two subscriptions for the tab to leak.
export type ShellTerminalHandle = {
  write(data: string): void;
  display(data: string): void;
  displayReply(line: string, markdown: string): void;
  focus(): void;
  scrollLines(amount: number): void;
  scrollToBottom(): void;
  rows(): number;
};

export function useShellTerminal({
  ptyId, containerRef, attachTerminal, copyText, reportColors, openLink, onExit, onCommandRunning, onCwd, onCommand, hookNonce,
}: Options): ShellTerminalHandle {
  const handleRef = useRef<PluginTerminal | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const runningRef = useRef(onCommandRunning);
  runningRef.current = onCommandRunning;
  const cwdRef = useRef(onCwd);
  cwdRef.current = onCwd;
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  // `attachTerminal` is read through a ref rather than closed over, and deliberately kept out of the
  // effect's dependencies below. It arrives on a capability object the host rebuilds whenever the tab
  // becomes visible or hidden, so depending on its identity tore the emulator down and built a new one
  // on every tab switch — losing the buffer, and with it the scrollback, each time. Nothing about the
  // attachment changes when visibility does.
  const attachRef = useRef(attachTerminal);
  attachRef.current = attachTerminal;
  const copyTextRef = useRef(copyText);
  copyTextRef.current = copyText;
  const openLinkRef = useRef(openLink);
  openLinkRef.current = openLink;
  const hookNonceRef = useRef(hookNonce);
  hookNonceRef.current = hookNonce;

  // Once per PTY, after mount, and read rather than watched: a theme change afterwards must not
  // rewrite the colors a session already started under. Reading at mount also beats the recorder's
  // own first output, which is what writes the header these colors go into.
  const reportColorsRef = useRef(reportColors);
  reportColorsRef.current = reportColors;
  useEffect(() => {
    if (!ptyId) return;
    reportColorsRef.current?.(ptyId, terminalColors());
  }, [ptyId]);

  useEffect(() => {
    const container = containerRef.current;
    const attach = attachRef.current;
    // No container means the body has not been laid out yet, no `attachTerminal` means this plugin
    // was given no way to reach a terminal, and no `ptyId` means there is no terminal yet. In each case
    // there is nothing to open and nothing to clean up.
    if (!container || !attach || !ptyId) return;

    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      allowProposedApi: true,
      fontFamily: styles.getPropertyValue('--mono').trim() || 'monospace',
      fontSize: Number(styles.getPropertyValue('--terminal-font-size').replace('px', '')) || 13.5,
      lineHeight: Number(styles.getPropertyValue('--terminal-line-height').replace('px', '')) || 1.2,
      cursorBlink: true,
      // The cursor shows only while the terminal holds the keyboard; the prompt mask below hides the
      // prompt on the same rule.
      cursorInactiveStyle: 'none',
      disableStdin: false,
      theme: shellTerminalTheme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    const isMac = isMacPlatform();
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !copySelectionChord(event, isMac) || !terminal.hasSelection()) return true;
      copyTextRef.current(terminal.getSelection());
      return false;
    });
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = shellTerminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const promptMask = attachPromptMask(terminal);
    registerShellMarkerHandlers(terminal, hookNonceRef.current, {
      running: (running) => {
        promptMask.setIdle(!running);
        runningRef.current(running);
      },
      command: (command) => { commandRef.current?.(command); },
      cwd: (cwd) => { cwdRef.current(cwd); },
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
      promptMask.dispose();
      terminal.dispose();
    };
  }, [ptyId, containerRef]);

  const write = useCallback((data: string) => { handleRef.current?.write(data); }, []);
  const display = useCallback((data: string) => { terminalRef.current?.write(data); }, []);
  const displayReply = useCallback((rawLine: string, rawMarkdown: string) => {
    const terminal = terminalRef.current;
    const line = stripTerminalControls(rawLine);
    const markdown = stripTerminalControls(rawMarkdown);
    const openReplyLink = (href: string) => { openLinkRef.current?.(href); };
    if (!terminal || insertMarkdownBlock(terminal, line, markdown, openReplyLink)) return;
    terminal.write(formatDispatchedCommand(line, markdownToAnsi(markdown)));
  }, []);
  const focus = useCallback(() => { terminalRef.current?.focus(); }, []);
  const scrollLines = useCallback((amount: number) => { terminalRef.current?.scrollLines(amount); }, []);
  const scrollToBottom = useCallback(() => { terminalRef.current?.scrollToBottom(); }, []);
  const rows = useCallback(() => terminalRef.current?.rows ?? 0, []);
  return { write, display, displayReply, focus, scrollLines, scrollToBottom, rows };
}
