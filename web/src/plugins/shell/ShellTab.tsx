import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandBarShell, useAppCommandBar, useCommandBarKeys, usePluginChordClaims } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellCompletion, ShellPayload } from '@shared/plugins/shell/shared';
import { useShellTerminal } from './useShellTerminal';
import { routeFor, shellLine } from './command-line-rules';
import { handleQueueKey, handleShellControlKey } from './command-bar-keys';
import { insertCommandAtCaret } from './insert-command-at-caret';
import { ShellHistoryPopup } from './ShellHistoryPopup';
import { ShellTabMeta } from './ShellTabMeta';
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
const NO_CHORDS: readonly string[] = [];
const NO_QUEUE_ITEMS: string[] = [];

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

  const { write, focus: focusTerminal } = useShellTerminal({
    ptyId: payload.ptyId,
    containerRef: terminalReference,
    attachTerminal: capabilities.attachTerminal,
    onCommandRunning: useCallback((running: boolean) => {
      setCommandRunning(running);
      void capabilities.intent<{ updated: boolean }>('command-state', { running }).catch(() => {
        capabilities.reportFailure('shell command status intent failed');
      });
    }, [capabilities]),
    // The tab closes when the shell exits: no exited state and no way to start another, so a closed
    // tab is the honest representation of a shell that is no longer running.
    onExit: useCallback(() => { capabilities.close(); }, [capabilities]),
  });

  // A shell that died while no browser was attached left this tab holding its payload with no way to
  // hear about it: the exit event went to nobody, and a plugin tab is in-memory only. Asking on mount
  // is what keeps such a tab from waiting for input that can never arrive.
  useEffect(() => {
    let cancelled = false;
    // `null` and not `undefined`: the request is serialized with `JSON.stringify`, which drops a key
    // whose value is `undefined`, and the server's `pluginIntent` guard requires the key to be there.
    // An absent key is refused before the plugin is asked, so the one intent carrying no data would be
    // the one that never arrives. `isEmptyShellIntent` accepts both, so `null` is equally a valid
    // "nothing" on the far side.
    void capabilities.intent<{ running: boolean }>('terminal-status', null).then((status) => {
      if (!cancelled && !status.running) capabilities.close();
    }).catch(() => {
      // A refusal here is this plugin's own request being malformed or its plugin disabled, not
      // anything the user did. Reporting it crosses the failure boundary instead of leaving an
      // unhandled rejection in the console on every mount.
      if (!cancelled) capabilities.reportFailure('shell terminal-status intent failed');
    });
    return () => { cancelled = true; };
  }, [capabilities]);

  // Focus belongs to the command line at all times, and a tab that has just become the visible one is
  // exactly when it would otherwise be sitting on the body after a click elsewhere.
  useEffect(() => {
    if (capabilities.active) inputReference.current?.focus();
  }, [capabilities.active]);

  const submit = useCallback((text: string) => {
    setMatches([]);
    if (routeFor(text) === 'shell') {
      // `!` is the override, so the marker itself is never part of what the shell receives.
      const line = shellLine(text);
      if (!line) return;
      write(`${line}\n`);
      setSent((previous) => [...previous, text]);
      return;
    }
    // Otherwise the application gets first refusal: a line it claims runs as that command and the shell
    // never sees it. The decision is the host's, because the command table is; this plugin asks rather
    // than keeping a copy of a list that would go stale the moment a command was added.
    //
    // First refusal is the host's *interception*, asked before the line is offered at all: a bare word
    // it opens a picker for, and `quit` or a `close` that would take the last tab with it, are answered
    // here rather than sent to a dispatcher where `quit` is a bare exit emit with nothing asked.
    if (appBar.intercept(text, capabilities.label)) return;
    //
    // The payload is the line itself, which is the only shape `isShellDispatch` accepts — anything else
    // is a request this plugin did not describe, and the host refuses it rather than guessing.
    void capabilities.intent<{ dispatched: boolean }>('dispatch', text)
      .then((result) => {
        if (result.dispatched) return;
        write(`${text}\n`);
        setSent((previous) => [...previous, text]);
      })
      // A refusal here means this plugin sent a payload its own guard rejects, which is a bug in the
      // plugin rather than anything the user typed, so it crosses the failure boundary instead of
      // leaving an unhandled rejection. The line is not written either way: a refused dispatch has not
      // established that the shell should have had it.
      .catch(() => { capabilities.reportFailure('shell dispatch intent refused'); });
  }, [appBar, capabilities, write]);

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
    bar, capabilities, draft, focusTerminal, historyOpen, queueOpen, write,
  ]);

  // `Ctrl+R` is claimed by this plugin's declaration, so it reaches this tab while it is the visible
  // one and belongs to the application everywhere else. The window handler consults the claim before
  // its own table, which is the whole of the rule and needs nothing here.
  usePluginChordClaims('shell', capabilities.label ?? 'shell', capabilities.claimedChords ?? NO_CHORDS, capabilities.active, useCallback(() => {
    setHistoryOpen((open) => !open);
  }, []));

  return (
    <div className="tab-body shell-tab">
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
        autoFocus
        ariaLabel="Shell command"
        above={matches.length > 1 ? (
          <div className="completions">
            {matches.map((match) => <span key={match} className="completion">{match}</span>)}
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
