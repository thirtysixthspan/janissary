import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandBarShell, useAppCommandBar, useCommandBarKeys, usePluginChordClaims } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellCompletion, ShellPayload } from '@shared/plugins/shell/shared';
import { useShellTerminal } from './useShellTerminal';
import { handleCompletionDismissKey, handleQueueKey, handleShellControlKey } from './command-bar-keys';
import { insertCommandAtCaret } from './insert-command-at-caret';
import { ShellHistoryPopup } from './ShellHistoryPopup';
import { ShellTabMeta } from './ShellTabMeta';
import { reportShellCwd } from './report-shell-cwd';
import { useShellSubmit } from './useShellSubmit';
import { useShellCommandQueue } from './useShellCommandQueue';
import type { ShellCommandQueue } from './shell-command-queue';
import { useShellScrollKeys } from './useShellScrollKeys';
import { useShellTerminalStatus } from './useShellTerminalStatus';
import { NO_CHORDS, NO_QUEUE_ITEMS } from './shell-tab-constants';
import './shell.css';

type Properties = {
  payload: ShellPayload;
  capabilities: TabPluginClientCapabilities;
};

// The status dot uses the same green as the shell terminal's own row.
const DOT_COLOR = '#7ee787';

// The one chord this plugin's declaration claims is not written out here. The claim is data the host
  // validated at activation and sends on this tab's view, so it is read from `claimedChords` rather
  // than restated — a second copy would be a second thing able to disagree with the claim actually
// enforced, with nothing to notice when it did. Absent means the declaration claimed none, which is
// the same as claiming nothing.
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
  const queueWasOpen = useRef(false);
  const queueReference = useRef<ShellCommandQueue | null>(null);
  const draftReference = useRef(draft);
  draftReference.current = draft;
  const queueOpen = appBar.queueOpen ?? false;
  const queueIndex = appBar.queueIndex ?? 0;
  const queueItems = appBar.queueItems ?? NO_QUEUE_ITEMS;

  useEffect(() => {
    if (queueOpen) {
      setDraft(queueItems[queueIndex] ?? '');
      inputReference.current?.focus();
    } else if (queueWasOpen.current) {
      setDraft('');
    }
    queueWasOpen.current = queueOpen;
  }, [queueIndex, queueItems, queueOpen]);

  useEffect(() => {
    const insertions = appBar.pluginCommandLineInsertions?.current;
    const label = capabilities.label;
    if (!insertions || !label) return;
    insertions.set(label, (text) => {
      const element = inputReference.current;
      if (!element) return;
      element.focus();
      insertCommandAtCaret(element, draftReference.current, text);
    });
    return () => { insertions.delete(label); };
  }, [appBar.pluginCommandLineInsertions, capabilities.label]);

  const { write, display, focus: focusTerminal, scrollLines, scrollToBottom, rows: terminalRows } = useShellTerminal({
    ptyId: payload.ptyId,
    containerRef: terminalReference,
    attachTerminal: capabilities.attachTerminal,
    onCommandRunning: useCallback((running: boolean) => {
      setCommandRunning(running);
      queueReference.current?.setBusy(running);
      void capabilities.intent<{ updated: boolean }>('command-state', { running }).catch(() => {
        capabilities.reportFailure('shell command status intent failed');
      });
    }, [capabilities]),
    onCwd: (cwd) => { reportShellCwd(capabilities, cwd); },
    // The tab closes when the shell exits: no exited state and no way to start another, so a closed
    // tab is the honest representation of a shell that is no longer running.
    onExit: useCallback(() => { capabilities.close(); }, [capabilities]),
  });

  useShellScrollKeys({
    active: capabilities.active,
    blocked: Boolean(appBar.blockingOverlayOpen) || Boolean(appBar.overlayOwnsCommandBar),
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
  const run = useShellSubmit({ appBar, capabilities, display, openHistory, setMatches, setSent, write });
  const { queue, submit } = useShellCommandQueue(capabilities, run, payload.commandRunning ?? false, (line) => {
    setMatches([]);
    setSent((previous) => [...previous, line]);
  });
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
    if (event.metaKey && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      event.stopPropagation();
      void capabilities.intent<{ dispatched: boolean }>('dispatch', 'zsh').catch(() => {
        capabilities.reportFailure('shell dispatch intent failed');
      });
      return;
    }
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

  // `Ctrl+R` is claimed by this plugin's declaration, so it reaches this tab while it is the visible
  // one and belongs to the application everywhere else. The window handler consults the claim before
  // its own table, which is the whole of the rule and needs nothing here.
  usePluginChordClaims('shell', capabilities.label ?? 'shell', capabilities.claimedChords ?? NO_CHORDS, capabilities.active, useCallback(() => {
    setHistoryOpen((open) => !open);
  }, []));

  // `data-claims-shift-tab` stands the application's section cycling down for keys inside this tab,
  // which it otherwise takes in the capture phase before either surface's own Shift+Tab can run.
  return (
    <div className="tab-body shell-tab" data-claims-shift-tab>
      <ShellTabMeta payload={payload} capabilities={capabilities} />
      {/* Clicking the terminal gives it focus so xterm sends keystrokes to the attached shell. */}
      <div
        className="harness-body shell-body"
        ref={terminalReference}
        onMouseDown={() => { focusTerminal(); }}
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
        onFocus={() => { appBar.onFocusTab?.(capabilities.label); }}
        onBlur={() => { appBar.onFocusTab?.(undefined); }}
        ghost={bar.ghost}
        dotColor={capabilities.dotColor ?? DOT_COLOR}
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
