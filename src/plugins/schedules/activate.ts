import {
  defineIntents,
  parseDockArgument,
  type AggregatedScheduleView,
  type TabPluginActivation,
  type TabPluginNotification,
} from '../api.js';
import {
  isCancelIntent,
  isEmptyIntent,
  isFocusOwnerIntent,
  isSchedulesPayload,
  type CancelIntent,
  type FocusOwnerIntent,
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
export function activate(): TabPluginActivation {
  return {
    isPayload: isSchedulesPayload,
    command: (argument, capabilities) => {
      const dock = parseDockArgument(argument);
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
    intent: defineIntents('schedules', isSchedulesPayload, {
      clear: {
        payload: isEmptyIntent,
        run: (_tab, _payload: Record<string, never>, capabilities) => {
          capabilities.topicAction({ topic: 'schedules', action: 'clear' });
          return null;
        },
      },
      cancel: {
        payload: isCancelIntent,
        run: (_tab, payload: CancelIntent, capabilities) => {
          capabilities.topicAction({
            topic: 'schedules', action: 'cancel', tab: payload.tab, id: payload.id,
          });
          return null;
        },
      },
      'focus-owner': {
        payload: isFocusOwnerIntent,
        run: (_tab, payload: FocusOwnerIntent, capabilities) => {
          capabilities.topicAction({ topic: 'schedules', action: 'focusOwner', tab: payload.tab });
          return null;
        },
      },
    }),
    opener: {
      // Unreachable: the manifest claims no file extensions, so the open pipeline never routes here.
      inline: (_file, capabilities) => capabilities.rejectRequest('schedules opens no files'),
      external: (_file, capabilities) => capabilities.rejectRequest('schedules opens no files'),
    },
  };
}
