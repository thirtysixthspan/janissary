import type {
  RemoteSessionView,
  TabPluginActivation,
  TabPluginNotification,
  TabPluginServerCapabilities,
} from '../api.js';
import {
  isEmptyIntent,
  isSessionIntent,
  isSessionsPayload,
  type SessionRow,
  type SessionsPayload,
} from './shared.js';

// The list is a singleton, so one fixed instance key is the whole of this plugin's tab bookkeeping:
// `openOrFocusTab` reuses the open tab, `updateTab` and `dockTab` address it, and a second
// `sessions` focuses what is already there instead of opening a second list.
const INSTANCE_KEY = 'sessions';
const TAB_TITLE = 'Sessions';
const USAGE = 'Usage: sessions [left|right]';

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
// `dockTab(…, null)` means.
function parseDock(argument: string): 'left' | 'right' | null | undefined {
  const trimmed = argument.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'left' || trimmed === 'right') return trimmed;
  return undefined;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isSessionsPayload,
    command: (argument, capabilities) => {
      const dock = parseDock(argument);
      if (dock === undefined) return capabilities.rejectRequest(USAGE);
      const data = capabilities.topicData('sessions');
      if (!isSessionsData(data)) return capabilities.reportFailure('invalid sessions topic data');
      capabilities.openOrFocusTab(INSTANCE_KEY, () => ({
        title: TAB_TITLE,
        payload: toPayload(data),
      }));
      capabilities.dockTab(INSTANCE_KEY, dock);
    },
    // The rows change with nothing in flight — a session is detached elsewhere, a peer's reattach
    // finally answers — so the host speaks first and the list redraws from the slice the topic hands
    // it. No title is returned: the name in the tab strip has nothing to do with what the list holds.
    notify: (event, capabilities) => {
      if (event.topic !== 'sessions') return;
      capabilities.updateTab(INSTANCE_KEY, () => ({ payload: toPayload(event.data) }));
    },
    intent: (request, capabilities) => {
      if (!isSessionsPayload(request.tabPayload)) {
        // The tab payload is the host's own record, not client input, so a bad one means this plugin
        // produced something invalid — a real failure rather than a request worth answering.
        return capabilities.reportFailure('invalid sessions tab payload');
      }
      return runIntent(request.intent, request.payload, request.tabPayload, capabilities);
    },
    opener: {
      // Unreachable: the manifest claims no file extensions, so the open pipeline never routes here.
      inline: (_file, capabilities) => capabilities.rejectRequest('sessions opens no files'),
      external: (_file, capabilities) => capabilities.rejectRequest('sessions opens no files'),
    },
  };
}

// Each verb names a row by the id the list is already showing, and the row itself says whether it
// offers that verb — so a client cannot detach a row that carries no detach, or reattach one that is
// already live, even before the host's own narrowing runs.
const ROW_INTENTS = {
  detach: 'detach', focus: 'focus', close: 'close',
  reattach: 'reattach', end: 'end', forget: 'forget',
} as const;

type RowIntent = keyof typeof ROW_INTENTS;

// The three that act on a tab this janissary holds. The rest act on a session that may have no tab
// at all, which is why they are addressed by session id instead.
type TabIntent = 'detach' | 'focus' | 'close';

const TAB_INTENTS = new Set<string>(['detach', 'focus', 'close']);

function isTabIntent(intent: RowIntent): intent is TabIntent {
  return TAB_INTENTS.has(intent);
}

function isRowIntent(intent: string): intent is RowIntent {
  return Object.hasOwn(ROW_INTENTS, intent);
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

function runIntent(
  intent: string,
  value: unknown,
  tab: SessionsPayload,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (intent === 'refresh') {
    if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid refresh payload');
    capabilities.topicAction({ topic: 'sessions', action: 'refresh' });
    return null;
  }
  if (!isRowIntent(intent)) return capabilities.rejectRequest(`unknown sessions intent "${intent}"`);
  if (!isSessionIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
  const row = tab.entries.find((entry) => entry.id === value.id);
  if (!row) return capabilities.rejectRequest(`no session row "${value.id}"`);
  return actOnRow(intent, row, capabilities);
}
