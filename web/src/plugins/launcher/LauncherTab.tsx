import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import type { LauncherPayload } from '@shared/plugins/launcher/shared';
import { SUMMARIZER_FLUSH_MS } from '@shared/plugins/launcher/shared';
import {
  CommandBarShell,
  PluginActionsHeader,
  useAppCommandBar,
  useCommandBarKeys,
  type TabPluginClientCapabilities,
} from '../api';
import { LauncherCommandList } from './CommandRail';
import { LauncherTabList } from './TabList';
import { useLauncherSubmit } from './useLauncherSubmit';

type Properties = {
  payload: LauncherPayload;
  capabilities: TabPluginClientCapabilities;
};

// The launcher's own command bar. A docked view that dispatches commands needs somewhere to show the
// answer, and the bar is the one answer to that the application already has — so the launcher hosts the
// application's own bar rather than a second textarea that would drift from it.
//
// The rows are the host's, built server-side and republished by the `tabs` topic: a plugin body sees no
// other tab's state and must not, so the sort, the badge, and the hover card all read what the payload
// carries rather than anything the client could otherwise know.
//
// The last reply is held here rather than in the payload, because it is this tab's own answer to a line
// this tab typed — it belongs to the view, not to the host's state.
export function LauncherTab({ payload, capabilities }: Properties) {
  const commandsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLTextAreaElement>(null);
  const appBar = useAppCommandBar();
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<string | null>(null);

  useEffect(() => {
    // The command rail comes first in the launcher, so that is where keyboard focus lands when the
    // docked tab receives it.
    if (capabilities.active) commandsRef.current?.focus();
  }, [capabilities.active]);

  // The summarizer's cadence. A flush is an intent the launcher's own client raises, because
  // `pluginIntent` binds the answering label to the tab it names — which is what lets the core ACP
  // capabilities run against *this* tab rather than against whichever tab a command happened to be typed
  // in. The interval lives in the client rather than in a server timer for the same reason, and it stops
  // when nothing is connected, so a rail nobody is looking at costs nothing.
  useEffect(() => {
    if (!capabilities.active) return;
    const timer = setInterval(() => {
      void capabilities.intent('summarize', {}).catch(() => {});
    }, SUMMARIZER_FLUSH_MS);
    return () => { clearInterval(timer); };
  }, [capabilities.active, capabilities]);

  const submit = useLauncherSubmit({
    appBar,
    capabilities,
    onReply: (text) => { setReply(text); },
    clear: () => { setDraft(''); },
  });

  // The lines this bar has sent, held here so the published keymap can walk them with ArrowUp and
  // ArrowDown. One entry per submitted line, because this is one tab and one bar.
  const [sent, setSent] = useState<string[]>([]);

  const bar = useCommandBarKeys({
    value: draft,
    setValue: setDraft,
    inputRef: barRef,
    history: sent,
    ghostHistory: appBar.ghostHistory,
    onSubmit: (line) => { setSent((previous) => [...previous, line]); submit(line); },
    onClear: () => { setReply(null); },
  });

  return (
    <div className="launcher plugin-tab" data-doc-shot="launcher">
      <PluginActionsHeader className="plugin-meta launcher-header">
        <span className="launcher-source">
          {payload.source === 'home' && <span title={payload.filePath}>your launcher.json</span>}
          {payload.problem !== undefined && (
            <span className="launcher-problem" title={payload.problem}>launcher.json problem</span>
          )}
        </span>
        <span className="plugin-actions">
          <button
            type="button"
            title="Open launcher.json"
            aria-label="Open launcher.json"
            onClick={() => { void capabilities.intent('configure', { id: 'configure' }).catch(() => {}); }}
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
        </span>
      </PluginActionsHeader>

      <LauncherCommandList
        commands={payload.commands}
        listRef={commandsRef}
        onOpen={(index) => {
          const entry = payload.commands[index];
          if (entry) void capabilities.intent('run-command', { id: entry.id }).catch(() => {});
        }}
        onUnknownIcon={(icon) => { void capabilities.intent('report-icon', { icon }).catch(() => {}); }}
      />
      <LauncherTabList
        payload={payload}
        listRef={tabsRef}
        onFocus={(row) => { void capabilities.intent('focus-tab', { label: row.label }).catch(() => {}); }}
      />
      {reply !== null && <div className="launcher-reply">{reply}</div>}
      <CommandBarShell
        value={draft}
        disabled={appBar.blockingOverlayOpen}
        inputRef={barRef}
        onChange={(next: string) => { setDraft(next); }}
        onKeyDown={bar.onKeyDown}
        onFocus={() => { appBar.onFocusChange(true); }}
        onBlur={() => { appBar.onFocusChange(false); }}
        ghost={bar.ghost}
        dotColor={capabilities.dotColor}
        autoFocus={false}
        ariaLabel="Launcher command"
      />
    </div>
  );
}
