import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandBarShell, useAppCommandBar, useCommandBarKeys, usePluginChordClaims } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellCompletion, ShellPayload } from '@shared/plugins/shell/shared';
import { useShellTerminal } from './useShellTerminal';
import { controlCharacterFor, routeFor, shellLine, type ControlKey } from './command-line-rules';
import { ShellHistoryPopup } from './ShellHistoryPopup';
import { ShellTabMeta } from './ShellTabMeta';
import './shell.css';

type Properties = {
  payload: ShellPayload;
  capabilities: TabPluginClientCapabilities;
};

// The row's dot. Static, and never busy: an agent tab's dot reports that a turn is in flight, and a
// shell has no turn — the bar's colour is the only thing it has to say.
const DOT_COLOR = '#7ee787';

// The one chord this plugin's declaration claims is not written out here. The claim is data the host
  // validated at activation and sends on this tab's view, so it is read from `claimedChords` rather
  // than restated — a second copy would be a second thing able to disagree with the claim actually
// enforced, with nothing to notice when it did. Absent means the declaration claimed none, which is
// the same as claiming nothing.
const NO_CHORDS: readonly string[] = [];

export function ShellTab({ payload, capabilities }: Properties) {
  const inputReference = useRef<HTMLTextAreaElement>(null);
  const terminalReference = useRef<HTMLDivElement>(null);
  const appBar = useAppCommandBar();
  const [draft, setDraft] = useState('');
  // Every line the bar has sent, oldest first — the complete history of this shell, because nothing can
  // be typed into the terminal directly.
  const [sent, setSent] = useState<string[]>([]);
  const [matches, setMatches] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { write } = useShellTerminal({
    ptyId: payload.ptyId,
    containerRef: terminalReference,
    attachTerminal: capabilities.attachTerminal,
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
    if (appBar.intercept(text)) return;
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
    // The history popup is modal over the bar while it is open, exactly as the agent tab's own history
    // picker is: its window listener owns Up, Down, Return and Escape. Handling them here as well would
    // mean one ArrowUp both moved its selection and rewrote the bar, since the bar's recall walks the
    // very lines the popup lists.
    if (historyOpen) return;
    // The shell's own control keys, before the baseline keymap: that one returns early on any held
    // modifier, so without this they would reach the window handler and be lost.
    const control = controlKeyOf(event);
    if (control) {
      const element = inputReference.current;
      const selection = element ? selectionIn(element) : '';
      const character = controlCharacterFor(control, Boolean(selection));
      if (character === undefined) {
        if (selection) capabilities.copyText(selection);
      } else {
        write(character);
      }
      event.preventDefault();
      return;
    }
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
  }, [bar, capabilities, draft, historyOpen, write]);

  // `Ctrl+R` is claimed by this plugin's declaration, so it reaches this tab while it is the visible
  // one and belongs to the application everywhere else. The window handler consults the claim before
  // its own table, which is the whole of the rule and needs nothing here.
  usePluginChordClaims('shell', capabilities.claimedChords ?? NO_CHORDS, capabilities.active, useCallback(() => {
    setHistoryOpen((open) => !open);
  }, []));

  return (
    <div className="tab-body shell-tab">
      <ShellTabMeta payload={payload} capabilities={capabilities} />
      {/* Clicking the terminal hands focus straight back to the command line rather than taking it: the
          bar is the only input path, and a terminal that looked focused but was not would be worse than
          one that plainly is not. */}
      <div
        className="harness-body shell-body"
        ref={terminalReference}
        onMouseDown={() => { inputReference.current?.focus(); }}
      />
      <CommandBarShell
        value={draft}
        inputRef={inputReference}
        onChange={(next) => { setDraft(next); setMatches([]); }}
        onKeyDown={onBarKeyDown}
        ghost={bar.ghost}
        dotColor={DOT_COLOR}
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

// The selected text inside the command line, which is what decides whether `Ctrl+C` copies or
// interrupts. Read from the element rather than the document because a selection elsewhere on the
// page is none of this bar's business.
function selectionIn(element: HTMLTextAreaElement): string {
  return element.selectionStart === element.selectionEnd ? '' : element.value.slice(
    element.selectionStart, element.selectionEnd,
  );
}

function controlKeyOf(event: {
  key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
}): ControlKey | undefined {
  if (!event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'c') return 'ctrl+c';
  if (key === 'd') return 'ctrl+d';
  if (key === 'z') return 'ctrl+z';
  return undefined;
}
