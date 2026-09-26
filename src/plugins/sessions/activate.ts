import {
  defineDockableList,
  defineIntents,
  type RemoteSessionView,
  type TabPluginActivation,
  type TabPluginIntentEntry,
  type TabPluginNotification,
  type TabPluginServerCapabilities,
} from '../api.js';
import {
  isEmptyIntent,
  isSessionIntent,
  isSessionsPayload,
  type SessionIntent,
  type SessionRow,
  type SessionsPayload,
} from './shared.js';

// The list is a singleton, so one fixed instance key is the whole of this plugin's tab bookkeeping:
// `openOrFocusTab` reuses the open tab, `updateTab` and `dockTab` address it, and a second
// `sessions` focuses what is already there instead of opening a second list.
const INSTANCE_KEY = 'sessions';
const TAB_TITLE = 'sessions';

function toPayload(rows: readonly RemoteSessionView[]): SessionsPayload {
  const entries: SessionRow[] = rows.map((row) => ({
    id: row.id,
    host: row.host,
    name: row.name,
    kind: row.kind,
    state: row.state,
    activity: row.activity,
    destination: row.destination,
    workspace: row.workspace,
    joined: row.joined,
    actions: [...row.actions],
    label: row.label,
    ...(row.session !== undefined && { session: row.session }),
    ...(row.failure !== undefined && { failure: row.failure }),
  }));
  return { entries };
}

function isSessionsData(
  data: TabPluginNotification['data'],
): data is readonly RemoteSessionView[] {
  return Array.isArray(data);
}

// `sessions` opens or focuses the list; `sessions left`/`sessions right` dock it into that sidebar;
// bare `sessions` on a docked list undocks it back to the centre and makes it active, which is what
// `dockTab(…, null)` means. See `defineDockableList` for what that pair of handlers does with the
// argument and the topic.
export function activate(): TabPluginActivation {
  return {
    isPayload: isSessionsPayload,
    // The rows change with nothing in flight — a session is detached elsewhere, a peer's attach
    // finally answers — so the host speaks first and the list redraws from the slice the topic hands
    // it. No title is sent with the update: the name in the tab strip has nothing to do with what the
    // list holds.
    ...defineDockableList({
      topic: 'sessions', instanceKey: INSTANCE_KEY, title: TAB_TITLE,
      isData: isSessionsData, toPayload,
    }),
    intent: defineIntents('sessions', isSessionsPayload, {
      refresh: {
        payload: isEmptyIntent,
        run: (_tab, _payload: Record<string, never>, capabilities) => {
          capabilities.topicAction({ topic: 'sessions', action: 'refresh' });
          return null;
        },
      },
      ...Object.fromEntries(ROW_VERBS.map((verb) => [verb, rowEntry(verb)])),
    }),
    opener: {
      // Unreachable: the manifest claims no file extensions, so the open pipeline never routes here.
      inline: (_file, capabilities) => capabilities.rejectRequest('sessions opens no files'),
      external: (_file, capabilities) => capabilities.rejectRequest('sessions opens no files'),
    },
  };
}

// Each verb names a row by the id the list is already showing, and the row itself says whether it
// offers that verb — so a client cannot detach a row that carries no detach, or attach one that is
// already live, even before the host's own narrowing runs.
const ROW_VERBS = ['detach', 'focus', 'close', 'attach', 'terminate', 'forget'] as const;

type RowIntent = typeof ROW_VERBS[number];

// The three that act on a tab this janissary holds. The rest act on a session that may have no tab
// at all, which is why they are addressed by session id instead.
type TabIntent = 'detach' | 'focus' | 'close';

const TAB_INTENTS = new Set<string>(['detach', 'focus', 'close']);

function isTabIntent(intent: RowIntent): intent is TabIntent {
  return TAB_INTENTS.has(intent);
}

function actOnRow(
  intent: RowIntent, row: SessionRow, capabilities: TabPluginServerCapabilities,
): null | never {
  if (!row.actions.includes(intent)) return capabilities.rejectRequest(`${intent} is not offered on that row`);
  if (isTabIntent(intent)) {
    capabilities.topicAction({ topic: 'sessions', action: intent, label: row.label });
    return null;
  }
  if (row.session === undefined) return capabilities.rejectRequest(`${intent} needs a recorded session`);
  capabilities.topicAction({ topic: 'sessions', action: intent, session: row.session });
  return null;
}

function rowEntry(intent: RowIntent): TabPluginIntentEntry<SessionsPayload, SessionIntent> {
  return {
    payload: isSessionIntent,
    run: (tab, payload, capabilities) => {
      const row = tab.entries.find((entry) => entry.id === payload.id);
      if (!row) return capabilities.rejectRequest(`no session row "${payload.id}"`);
      return actOnRow(intent, row, capabilities);
    },
  };
}
