import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  CommandBarShell, StatusPanels, useCommandBarKeys, usePluginChordClaims, useStatusWindows, workspacedIcon,
  type TabPluginClientCapabilities,
} from '../api';
import type { ShellCompletion, ShellPayload } from '@shared/plugins/shell/shared';
import { useShellTerminal } from './useShellTerminal';
import { controlCharacterFor, routeFor, shellLine, type ControlKey } from './command-line-rules';
import { ShellHistoryPopup } from './ShellHistoryPopup';
import './shell.css';

type Properties = {
  payload: ShellPayload;
  capabilities: TabPluginClientCapabilities;
};

// The shell tab's own metadata row.
//
// Written here rather than imported from the host's `AgentTabMeta`, which is the self-contained
// choice this plugin was built for: the same structure and the same class names, so it looks
// identical, with the actions supplied by declared capabilities rather than borrowed markup. The
// control it omits is **Open transcript**, which would open nothing — the terminal replaced the
// transcript, so there is no longer one to open.
function ShellTabMeta({ payload, capabilities }: Properties) {
  const windows = useStatusWindows('shell');
  return (
    <>
      <div className="tab-meta">
        <span className="tab-cwd">{payload.cwd}</span>
        <span className="tab-flags">
          {payload.workspace && (
            <span className="tab-flag tab-flag--active" role="img" aria-label="Workspaced" title="Workspaced">
              <FontAwesomeIcon icon={workspacedIcon} />
            </span>
          )}
        </span>
        <span className="tab-meta-actions">
          <button
            type="button"
            className="tab-open-files"
            title={payload.workspace ? 'Open file navigator in this workspace' : 'Open file navigator here'}
            onClick={() => capabilities.openFileNavigator?.()}
          >
            <FontAwesomeIcon icon={FILES_ICON} />
          </button>
          <button
            type="button"
            className="tab-launch-agent"
            title={payload.workspace ? 'New agent in this workspace' : 'New agent here'}
            onClick={() => capabilities.launchAgentHere?.()}
          >
            <FontAwesomeIcon icon={AGENT_ICON} />
          </button>
          {capabilities.splitAction}
        </span>
      </div>
      <StatusPanels
        connections={payload.connections}
        schedule={payload.schedule}
        connectionsWindow={windows.connections}
        scheduleWindow={windows.schedule}
        interactive
      />
    </>
  );
}

// The two glyphs this row's own buttons carry, spelled out because a plugin may not import the host's
// icon module — `workspacedIcon` is published only because the workspace flag needs it.
const FILES_ICON = { prefix: 'fas' as const, iconName: 'folder-open' as const };
const AGENT_ICON = { prefix: 'fas' as const, iconName: 'plus' as const };

// The row's dot. Static, and never busy: an agent tab's dot reports that a turn is in flight, and a
// shell has no turn — the bar's colour is the only thing it has to say.
const DOT_COLOR = '#7ee787';

// The one chord this plugin's declaration claims, written out here to mirror the manifest: the claim
// rides the tab's wire view, but a plugin cannot read its own declaration, and the host's own
// `validateDeclaration` still refuses a malformed id at activation.
const CLAIMED_CHORDS = ['ctrl+r'];

export function ShellTab({ payload, capabilities }: Properties) {
  const inputReference = useRef<HTMLTextAreaElement>(null);
  const terminalReference = useRef<HTMLDivElement>(null);
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
    void capabilities.intent<{ running: boolean }>('terminal-status', undefined).then((status) => {
      if (!cancelled && !status.running) capabilities.close();
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
    void capabilities.intent<{ dispatched: boolean }>('dispatch', { line: text })
      .then(() => {
        write(`${text}\n`);
        setSent((previous) => [...previous, text]);
      });
  }, [capabilities, write]);

  const bar = useCommandBarKeys({
    value: draft,
    setValue: setDraft,
    inputRef: inputReference,
    // The bar recalls the lines it has sent, oldest first. Nothing else can reach this shell, so this
    // is the whole of its history rather than a subset of one.
    history: sent,
    onSubmit: submit,
    onClear: () => { setMatches([]); },
  });

  const onBarKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      });
      return;
    }
    bar.onKeyDown(event);
  }, [bar, capabilities, draft, write]);

  // `Ctrl+R` is claimed by this plugin's declaration, so it reaches this tab while it is the visible
  // one and belongs to the application everywhere else. The window handler consults the claim before
  // its own table, which is the whole of the rule and needs nothing here.
  usePluginChordClaims('shell', CLAIMED_CHORDS, capabilities.active, useCallback(() => {
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
          lines={sent.toReversed()}
          onPick={(line) => { setDraft(line); setHistoryOpen(false); }}
          onClose={() => { setHistoryOpen(false); }}
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