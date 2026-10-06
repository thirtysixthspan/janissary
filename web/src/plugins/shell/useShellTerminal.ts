import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  copySelectionChord, isMacPlatform, registerTerminalSelection, unregisterTerminalSelection,
  type PluginTerminal,
} from '../api';
import { shellTerminalTheme } from './shell-terminal-theme';
import { createShellMarkerNonce } from './shell-status-hooks';
import {
  SHELL_INITIALIZING, installShellHooks, registerShellMarkerHandlers, type ClaimShellHooks,
} from './shell-marker-handlers';
import { insertMarkdownBlock } from './markdown-block';
import { attachPromptMask } from './prompt-mask';
import { formatDispatchedCommand } from './format-dispatched-command';
import { markdownToAnsi } from './markdown-to-ansi';
import { stripTerminalControls } from './strip-terminal-controls';

export type AttachTerminal = (
  ptyId: string, onData: (data: string) => void,
) => PluginTerminal | Promise<PluginTerminal>;

type Options = {
  ptyId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  attachTerminal: AttachTerminal | undefined;
  copyText: (text: string) => void;
  // Opens a link clicked in a rendered reply. Absent, a click on one still never navigates the window.
  openLink?: (href: string) => void;
  onCommandRunning: (running: boolean) => void;
  onCwd: (cwd: string) => void;
  onCommand?: (command: string) => void;
  // Called when the shell behind this terminal exits. A plugin tab has nowhere else to hear it: the
  // event is broadcast once, to whoever happened to be connected at the time.
  onExit: () => void;
  // The nonce the terminal's hooks were installed with, when an earlier attach installed them. Read
  // once, at mount: with one, the mount only re-attaches and types nothing into the shell.
  hookNonce: string | undefined;
  claimHooks: ClaimShellHooks;
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
  ptyId, containerRef, attachTerminal, copyText, openLink, onExit, onCommandRunning, onCwd, onCommand, hookNonce, claimHooks,
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
  const claimRef = useRef(claimHooks);
  claimRef.current = claimHooks;

  useEffect(() => {
    const container = containerRef.current;
    const attach = attachRef.current;
    // No container means the body has not been laid out yet, and no `attachTerminal` means this plugin
    // was given no way to reach a terminal. Either way there is nothing to open and nothing to clean up.
    if (!container || !attach) return;

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
    // An installed nonce means a shell whose hooks are already running, possibly with a full-screen
    // program in the foreground: nothing is hidden and nothing is typed. Only a terminal with no
    // hooks yet stays hidden until its setup line has run.
    const installed = hookNonceRef.current;
    if (installed === undefined) container.classList.add(SHELL_INITIALIZING);
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = shellTerminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const nonce = { current: installed ?? createShellMarkerNonce() };
    const promptMask = attachPromptMask(terminal);
    registerShellMarkerHandlers(terminal, container, nonce, {
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
      if (installed === undefined) installShellHooks(handle, container, nonce, claimRef.current);
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
