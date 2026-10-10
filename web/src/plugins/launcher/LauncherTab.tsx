import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboard, faGear } from '@fortawesome/free-solid-svg-icons';
import type { LauncherPayload } from '@shared/plugins/launcher/shared';
import { SUMMARIZER_FLUSH_MS } from '@shared/plugins/launcher/shared';
import {
  PluginActionsHeader,
  type TabPluginClientCapabilities,
} from '../api';
import { LauncherCommandList } from './CommandRail';
import { LauncherTabList } from './TabList';
import { createLauncherActions } from './launcher-actions';
import { useClock } from './useClock';

type Properties = {
  payload: LauncherPayload;
  capabilities: TabPluginClientCapabilities;
};

// The rows are the host's, built server-side and republished by the `tabs` topic: a plugin body sees no
// other tab's state and must not, so the sort, the badge, and the hover card all read what the payload
// carries rather than anything the client could otherwise know.
//
// The last reply is held here rather than in the payload, because it is this tab's own answer to a
// command selected from its rail — it belongs to the view, not to the host's state.
export function LauncherTab({ payload, capabilities }: Properties) {
  const commandsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [reply, setReply] = useState<string | null>(null);
  // The rail's own clock, so a row's age advances while the launcher is on screen even though nothing
  // has been broadcast to make it. One minute is the coarsest unit a row's age is expressed in.
  const now = useClock(capabilities.active);

  useEffect(() => {
    // The command rail comes first in the launcher, so that is where keyboard focus lands when the
    // docked tab receives it.
    if (capabilities.active) commandsRef.current?.focus();
  }, [capabilities.active]);

  // The summarizer's cadence. A flush is an intent the launcher's own client raises, because
  // `pluginIntent` binds the answering label to the tab it names — which is what lets the core ACP
  // capabilities run against *this* tab rather than against whichever tab a command happened to be run
  // in. The interval lives in the client rather than in a server timer for the same reason, and it stops
  // when nothing is connected, so a rail nobody is looking at costs nothing.
  useEffect(() => {
    if (!capabilities.active) return;
    const timer = setInterval(() => {
      void capabilities.intent('summarize', {}).catch(() => {});
    }, SUMMARIZER_FLUSH_MS);
    return () => { clearInterval(timer); };
  }, [capabilities.active, capabilities]);

  const actions = createLauncherActions(capabilities, (text) => { setReply(text); });

  return (
    <div className="launcher plugin-tab" data-doc-shot="launcher">
      {/* The application's dock control sits in the sidebar's metadata bar; launcher actions join it. */}
      <PluginActionsHeader className="plugin-meta launcher-header">
        <span className="plugin-actions">
          <button
            type="button"
            title="Open ACP transcript"
            aria-label="Open ACP transcript"
            onClick={() => { capabilities.openAcpTranscript?.(); }}
          >
            <FontAwesomeIcon icon={faClipboard} />
          </button>
          <button
            type="button"
            title="Open launcher.json"
            aria-label="Open launcher.json"
            onClick={() => { actions.configure(payload.filePath); }}
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
        </span>
      </PluginActionsHeader>
      {(payload.source === 'home' || payload.problem !== undefined) && (
        <div className="launcher-source">
          {payload.source === 'home' && <span title={payload.filePath}>your launcher.json</span>}
          {payload.problem !== undefined && (
            <span className="launcher-problem" title={payload.problem}>launcher.json problem</span>
          )}
        </div>
      )}

      <LauncherCommandList
        commands={payload.commands}
        listRef={commandsRef}
        onOpen={(index) => {
          const entry = payload.commands[index];
          if (entry) actions.command(entry);
        }}
        onUnknownIcon={(icon) => { void capabilities.intent('report-icon', { icon }).catch(() => {}); }}
      />
      <LauncherTabList
        payload={payload}
        listRef={tabsRef}
        onFocus={(row) => { void capabilities.intent('focus-tab', { label: row.label }).catch(() => {}); }}
        now={now}
      />
      {reply !== null && <div className="launcher-reply">{reply}</div>}
    </div>
  );
}
