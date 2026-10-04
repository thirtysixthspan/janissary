import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type { ConnectionView, ScheduleView } from '../protocol.js';
import type {
  TabPluginActivation, TabPluginDeclaration, TabPluginHostState, TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginCallOutcome } from './invoke.js';
import type { PluginRecord } from './status.js';

export const TAB_PLUGIN_HOST_STATE_TIMEOUT_MS = 1000;

const BACKGROUND_ORIGIN: PluginFailureOrigin = { label: '', command: '' };

type Slice = TabPluginHostState;

export type TabPluginHostStatePort = {
  managers: Managers;
  records(): readonly PluginRecord[];
  timeoutMs: number;
  connectionsFor(label: string): ConnectionView[];
  scheduleView(label: string): ScheduleView[];
  invoke(
    record: PluginRecord,
    activation: TabPluginActivation,
    origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => void | Promise<void>,
    timeoutMs: number,
  ): Promise<PluginCallOutcome<void>>;
  disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): void;
};

// What each tab was last handed, so a push happens on a change rather than on every mutation. The
// `state` bus fires on essentially every keystroke-driven change in the application, so comparing
// first is the whole point: without it a shell tab would be handed its own state thousands of times
// a minute and every one of those would be a payload update and a broadcast.
//
// Keyed by instance key rather than by tab label. A label is reused — the second shell tab in a
// session is `shell1` again once the first has gone — and a fingerprint on file under a name the next
// tab also carries would be computed already, so that tab would never be delivered its rows at all.
// The instance key is the one field unique per invocation and stable for the tab's life, which
// `nextInstanceKey` mints afresh for every tab and `removeTabAt` preserves across the `Tab` object it
// rebuilds for each survivor. A `WeakMap` keyed on the tab itself would not survive that rebuild.
const lastPushed = new WeakMap<PluginRecord, Map<string, string>>();

// One tab's two slices, rendered to compare by value. JSON is the honest comparison here because both
// sides are the host's own already-plain view arrays, and a plugin payload must be JSON-compatible
// anyway — so this compares exactly what the client would receive.
function fingerprint(slice: Slice): string {
  return JSON.stringify([slice.connections, slice.schedule]);
}

function requested(declaration: TabPluginDeclaration, field: 'connections' | 'schedule'): boolean {
  return (declaration.hostState ?? []).includes(field);
}

// The rows for one tab, carrying only the slices its declaration asked for. A plugin that named
// neither never reaches here, and one that named one never receives the other — the slice list is
// the grant, and it is also the payload the client would see. The tab's current payload rides along
// so the handler can merge rather than replace: only the plugin knows which fields are its own.
function readSlice(
  port: TabPluginHostStatePort,
  label: string,
  instanceKey: string,
  tabPayload: unknown,
  declaration: TabPluginDeclaration,
): Slice {
  return {
    instanceKey,
    tabPayload,
    connections: requested(declaration, 'connections') ? port.connectionsFor(label) : [],
    schedule: requested(declaration, 'schedule') ? port.scheduleView(label) : [],
  };
}

async function deliver(
  port: TabPluginHostStatePort,
  record: PluginRecord,
  slice: Slice,
): Promise<void> {
  const activation = record.activation;
  if (!activation?.hostState) return;
  const outcome = await port.invoke(
    record,
    activation,
    BACKGROUND_ORIGIN,
    (capabilities) => activation.hostState?.(slice, capabilities),
    port.timeoutMs,
  );
  // A rejection has no caller to answer, so only failure matters here.
  if (outcome.status === 'failed') port.disable(record, outcome.error, BACKGROUND_ORIGIN);
}

// Fan out to every plugin that declared host state, owns at least one tab, and whose tabs have moved
// since the last push. Concurrent, like a notification: a status window cannot influence a host
// outcome, so nothing waits on it.
function dispatch(port: TabPluginHostStatePort): void {
  for (const record of port.records()) {
    if (record.state !== 'active' || !record.activation?.hostState) continue;
    if ((record.declaration.hostState ?? []).length === 0) continue;
    const pushed = lastPushed.get(record) ?? new Map<string, string>();
    // Published *before* the loop, not after it. A delivery re-enters this function: the plugin's
    // handler merges rows with `updateTab`, which emits `state: dirty` inline, and `messageBus.emit`
    // is synchronous. A map still unpublished is invisible to that pass, which builds its own empty
    // map, sees the tab as never pushed, and delivers again — for as long as the tab keeps emitting.
    lastPushed.set(record, pushed);
    const open = new Set<string>();
    for (const tab of port.managers.tab.tabs) {
      if (tab.plugin?.id !== record.declaration.id) continue;
      const instanceKey = tab.plugin.instanceKey;
      open.add(instanceKey);
      const slice = readSlice(
        port, tab.label, instanceKey, tab.plugin.payload, record.declaration,
      );
      const print = fingerprint(slice);
      if (pushed.get(instanceKey) === print) continue;
      // Recorded before the call, so a handler that throws does not leave the tab looking stale and
      // retrying on every subsequent mutation for the rest of the session.
      pushed.set(instanceKey, print);
      void deliver(port, record, slice);
    }
    // A closed tab's memory goes with it. Keyed per instance, an entry outlives the tab it described,
    // so a session that opened a hundred shell tabs would still be holding a hundred fingerprints.
    for (const instanceKey of pushed.keys()) {
      if (!open.has(instanceKey)) pushed.delete(instanceKey);
    }
  }
}

// A tab's rows are the host's own view data, read through the same functions `buildTabView` uses, so
// there is exactly one computation of either list. Subscribed once, and only when some declaration
// actually asks: a build in which no plugin wants host state takes no subscription at all.
export function subscribeTabPluginHostState(port: TabPluginHostStatePort): Subscription[] {
  const wanted = port.records().some((record) => (record.declaration.hostState ?? []).length > 0);
  if (!wanted) return [];
  return [messageBus.on('state', 'dirty', () => { dispatch(port); })];
}