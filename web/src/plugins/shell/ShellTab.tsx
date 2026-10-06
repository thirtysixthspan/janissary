import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandBarShell, useAppCommandBar, useCommandBarKeys, usePluginChordClaims } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellCompletion, ShellPayload } from '@shared/plugins/shell/shared';
import { useShellTabTerminal } from './useShellTabTerminal';
import { handleCompletionDismissKey, handleQueueKey, handleShellControlKey } from './command-bar-keys';
import { ShellHistoryPopup } from './ShellHistoryPopup';
import { ShellTabMeta } from './ShellTabMeta';
import { useShellSubmit } from './useShellSubmit';
import { useShellCommandQueue } from './useShellCommandQueue';
import { useApplicationBarEdits } from './useApplicationBarEdits';
import type { ShellCommandQueue } from './shell-command-queue';
import { useShellScrollKeys } from './useShellScrollKeys';
import { useShellTerminalStatus } from './useShellTerminalStatus';
import { useTerminalCommandHistory } from './useTerminalCommandHistory';
import { appendShellHistory } from './shell-history';
import { NEW_SHELL_CHORD, NO_CHORDS, SHELL_DOT_COLOR } from './shell-tab-constants';
import './shell.css';

type Properties = {
  payload: ShellPayload;
  capabilities: TabPluginClientCapabilities;
};

// The chords this plugin's declaration claims are not listed here. The claim is data the host
// validated at activation and sends on this tab's view, so it is read from `claimedChords` rather
// than restated — a second copy would be a second thing able to disagree with the claim actually
// enforced, with nothing to notice when it did. Absent means the declaration claimed none, which is
// the same as claiming nothing. The body names only the one chord whose answer differs from the
// history toggle, so it can tell which claimed chord fired.
export function ShellTab({ payload, capabilities }: Properties) {
  const inputReference = useRef<HTMLTextAreaElement>(null);
  const terminalReference = useRef<HTMLDivElement>(null);
  const appBar = useAppCommandBar();
  const [draft, setDraft] = useState('');
  // Lines the bar has sent, oldest first. Direct terminal input belongs to zsh's own history.
  const [sent, setSent] = useState<string[]>([]);
  const [matches, setMatches] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commandRunning, setCommandRunning] = useState(payload.commandRunning ?? false);
  const queueReference = useRef<ShellCommandQueue | null>(null);
  const queueOpen = appBar.queueOpen;
  useApplicationBarEdits(appBar, inputReference, draft, setDraft);

  const terminalHistory = useTerminalCommandHistory(setSent);
  const { write, displayReply, focus: focusTerminal, scrollLines, scrollToBottom, rows: terminalRows } = useShellTabTerminal({
    payload,
    capabilities,
    containerRef: terminalReference,
    onCommand: terminalHistory.onCommand,
    onCommandRunning: (running) => {
      setCommandRunning(running);
      queueReference.current?.setBusy(running);
    },
  });

  useShellScrollKeys({
    active: capabilities.active,
    blocked: appBar.blockingOverlayOpen || appBar.overlayOwnsCommandBar,
    rows: terminalRows,
    scrollLines,
    scrollToBottom,
  });

  useShellTerminalStatus(capabilities);

  // Focus belongs to the command line at all times, and a tab that has just become the visible one is
  // exactly when it would otherwise be sitting on the body after a click elsewhere.
  useEffect(() => {
    if (capabilities.active) inputReference.current?.focus();
  }, [capabilities.active]);

  const openHistory = useCallback(() => { setHistoryOpen(true); }, []);
  const run = useShellSubmit({
    appBar, capabilities, displayReply, expectCommand: terminalHistory.expect, openHistory, setMatches, setSent, write,
  });
  const { queue, submit } = useShellCommandQueue(capabilities, run, payload.commandRunning ?? false, (line) => {
    setMatches([]);
    setSent((previous) => appendShellHistory(previous, line));
  }, appBar.queuedLines);
  queueReference.current = queue;

  const bar = useCommandBarKeys({
    value: draft,
    setValue: setDraft,
    inputRef: inputReference,
    // The bar recalls the lines it has sent, oldest first. Nothing else can reach this shell, so this
    // is the whole of its history rather than a subset of one.
    history: sent,
    ghostHistory: appBar.ghostHistory,
    onSubmit: submit,
    onClear: () => { setMatches([]); },
  });

  const onBarKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (appBar.blockingOverlayOpen) return;
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      focusTerminal();
      return;
    }
    if (handleQueueKey(event, queueOpen, draft, appBar.onDeleteQueued)) return;
    if (appBar.overlayOwnsCommandBar) return;
    // The history popup is modal over the bar while it is open, exactly as the agent tab's own history
    // picker is: its window listener owns Up, Down, Return and Escape. Handling them here as well would
    // mean one ArrowUp both moved its selection and rewrote the bar, since the bar's recall walks the
    // very lines the popup lists.
    if (historyOpen) return;
    if (handleCompletionDismissKey(event, matches.length > 1, () => { setMatches([]); })) return;
    // The shell's own control keys, before the baseline keymap: that one returns early on any held
    // modifier, so without this they would reach the window handler and be lost.
    if (handleShellControlKey(event, inputReference.current, capabilities.copyText, write)) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      void capabilities.intent<ShellCompletion>('complete', {
        line: draft,
        cursor: inputReference.current?.selectionStart ?? draft.length,
      }).then((result) => {
        setMatches(result.matches);
        if (result.matches.length === 1) setDraft(result.newInput);
      }).catch(() => { capabilities.reportFailure('shell completion intent failed'); });
      return;
    }
    bar.onKeyDown(event);
  }, [
    appBar.blockingOverlayOpen, appBar.onDeleteQueued, appBar.overlayOwnsCommandBar,
    bar, capabilities, draft, focusTerminal, historyOpen, matches.length, queueOpen, write,
  ]);

  // `Ctrl+R` and `Cmd+T` are claimed by this plugin's declaration, so they reach this tab while it is
  // the visible one and belong to the application everywhere else. The window handler consults the
  // claim before its own table, which is the whole of the rule and needs nothing here. Being a window
  // chord rather than a bar key is what lets `Cmd+T` open a sibling shell with the terminal focused.
  usePluginChordClaims('shell', capabilities.label ?? 'shell', capabilities.claimedChords ?? NO_CHORDS, capabilities.active, useCallback((chordId: string) => {
    if (chordId !== NEW_SHELL_CHORD) {
      setHistoryOpen((open) => !open);
      return;
    }
    void capabilities.intent<{ dispatched: boolean }>('dispatch', 'zsh').catch(() => {
      capabilities.reportFailure('shell dispatch intent failed');
    });
  }, [capabilities]));

  const dotColor = capabilities.dotColor ?? SHELL_DOT_COLOR;

  // `data-claims-shift-tab` stands the application's section cycling down for keys inside this tab,
  // which it otherwise takes in the capture phase before either surface's own Shift+Tab can run.
  return (
    <div className="tab-body shell-tab" data-claims-shift-tab>
      <ShellTabMeta payload={payload} capabilities={capabilities} />
      {/* Clicking the terminal gives it focus so xterm sends keystrokes to the attached shell. The
          stylesheet lights its left-hand line in the tab's colour while it holds the keyboard. */}
      <div
        className="harness-body shell-body"
        data-doc-shot="shell-view"
        ref={terminalReference}
        style={{ '--shell-focus-color': dotColor } as React.CSSProperties}
        onClick={() => { inputReference.current?.focus(); }}
        onDoubleClick={() => { focusTerminal(); }}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Tab' || !event.shiftKey) return;
          event.preventDefault();
          event.stopPropagation();
          inputReference.current?.focus();
        }}
      />
      <CommandBarShell
        value={draft}
        disabled={appBar.blockingOverlayOpen}
        inputRef={inputReference}
        onChange={(next) => {
          setDraft(next);
          setMatches([]);
          if (queueOpen) appBar.onEditQueued?.(next);
        }}
        onKeyDown={onBarKeyDown}
        onFocus={() => { appBar.onFocusChange(true); }}
        onBlur={() => { appBar.onFocusChange(false); }}
        ghost={bar.ghost}
        dotColor={dotColor}
        busy={commandRunning}
        label={commandRunning ? 'queue' : undefined}
        autoFocus
        acceptsFileDrops
        ariaLabel="Shell command"
        above={matches.length > 1 ? (
          <div className="completions">
            {matches.map((match, index) => (
              <span key={match} className="completion">
                {index > 0 && '  '}{match}
              </span>
            ))}
          </div>
        ) : undefined}
      />
      {historyOpen && (
        <ShellHistoryPopup
          lines={sent}
          onPick={(line) => { setDraft(line); }}
          onClose={() => { setHistoryOpen(false); inputReference.current?.focus(); }}
        />
      )}
    </div>
  );
}
