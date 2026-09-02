import type {
  AggregatedScheduleView,
  TabPluginActivation,
  TabPluginNotification,
  TabPluginServerCapabilities,
} from '../api.js';
import {
  isCancelIntent,
  isEmptyIntent,
  isFocusOwnerIntent,
  isSchedulesPayload,
  type ScheduleRow,
  type SchedulesPayload,
} from './shared.js';

// The list is a singleton, so one fixed instance key is the whole of this plugin's tab bookkeeping:
// `openOrFocusTab` reuses the open tab, `updateTab` and `dockTab` address it, and a second
// `schedules` focuses what is already there instead of opening a second list.
const INSTANCE_KEY = 'schedules';
const TAB_TITLE = 'schedules';

function toPayload(rows: readonly AggregatedScheduleView[]): SchedulesPayload {
  const entries: ScheduleRow[] = rows.map((row) => ({
    id: row.id,
    spec: row.spec,
    next: row.next,
    recurring: row.recurring,
    tab: row.tab,
    command: row.command,
  }));
  return { entries };
}

function isSchedulesData(
  data: TabPluginNotification['data'],
): data is readonly AggregatedScheduleView[] {
  return Array.isArray(data);
}

// `schedules` opens or focuses the list; `schedules left`/`schedules right` dock it into that
// sidebar; bare `schedules` on a docked list undocks it back to the centre and makes it active,
// which is what `dockTab(…, null)` means.
function parseDock(argument: string): 'left' | 'right' | null | undefined {
  const trimmed = argument.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'left' || trimmed === 'right') return trimmed;
  return undefined;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isSchedulesPayload,
    command: (argument, capabilities) => {
      const dock = parseDock(argument);
      if (dock === undefined) return capabilities.rejectRequest('Usage: schedules [left|right]');
      const data = capabilities.topicData('schedules');
      if (!isSchedulesData(data)) return capabilities.reportFailure('invalid schedules topic data');
      capabilities.openOrFocusTab(INSTANCE_KEY, () => ({
        title: TAB_TITLE,
        payload: toPayload(data),
      }));
      capabilities.dockTab(INSTANCE_KEY, dock);
    },
    // The rows change with nothing in flight — a schedule fires, or another tab adds one — so the
    // host speaks first and the list redraws from the slice the topic hands it. No title is returned:
    // the name in the tab strip has nothing to do with what the list currently holds.
    notify: (event, capabilities) => {
      if (event.topic !== 'schedules') return;
      capabilities.updateTab(INSTANCE_KEY, () => ({ payload: toPayload(event.data) }));
    },
    intent: (request, capabilities) => {
      if (!isSchedulesPayload(request.tabPayload)) {
        // The tab payload is the host's own record, not client input, so a bad one means this plugin
        // produced something invalid — a real failure rather than a request worth answering.
        return capabilities.reportFailure('invalid schedules tab payload');
      }
      return runIntent(request.intent, request.payload, capabilities);
    },
    opener: {
      // Unreachable: the manifest claims no file extensions, so the open pipeline never routes here.
      inline: (_file, capabilities) => capabilities.rejectRequest('schedules opens no files'),
      external: (_file, capabilities) => capabilities.rejectRequest('schedules opens no files'),
    },
  };
}

function runIntent(
  intent: string, payload: unknown, capabilities: TabPluginServerCapabilities,
): null | never {
  switch (intent) {
    case 'clear': {
      if (!isEmptyIntent(payload)) return capabilities.rejectRequest('invalid clear payload');
      capabilities.topicAction({ topic: 'schedules', action: 'clear' });
      return null;
    }
    case 'cancel': {
      if (!isCancelIntent(payload)) return capabilities.rejectRequest('invalid cancel payload');
      capabilities.topicAction({
        topic: 'schedules', action: 'cancel', tab: payload.tab, id: payload.id,
      });
      return null;
    }
    case 'focus-owner': {
      if (!isFocusOwnerIntent(payload)) return capabilities.rejectRequest('invalid focus-owner payload');
      capabilities.topicAction({ topic: 'schedules', action: 'focusOwner', tab: payload.tab });
      return null;
    }
    default: {
      return capabilities.rejectRequest(`unknown schedules intent "${intent}"`);
    }
  }
}
