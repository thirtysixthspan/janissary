import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type { ConnectionView, ScheduleView } from '../protocol.js';
import { tabRuntime } from '../tab/runtime.js';
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

// What a tab was last handed lives on the tab's own runtime record, so a push happens on a change
// rather than on every mutation. The `state` bus fires on essentially every keystroke-driven change in
// the application, so comparing first is the whole point: without it a shell tab would be handed its
// own state thousands of times a minute and every one of those would be a payload update and a
// broadcast.
//
// Held on the tab rather than in a map keyed by label or instance key, so the memory goes when the
// tab does. A tab that takes a label or an instance key a closed tab held is a new tab with no memory
// and is delivered its rows, while every rebuild of a surviving tab (`removeTabAt`'s spread,
// `updatePluginTab`'s in-place update) carries the same runtime record along.
//
// One tab's two slices and its instance key, rendered to compare by value. The key is part of it so a
// tab `updateTab` re-keyed is delivered again under the key the plugin now addresses it by. JSON is
// the honest comparison here because both sides are the host's own already-plain view arrays, and a
// plugin payload must be JSON-compatible anyway — so this compares exactly what the client would
// receive.
function fingerprint(slice: Slice): string {
  return JSON.stringify([slice.instanceKey, slice.connections, slice.schedule]);
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
    for (const tab of port.managers.tab.tabs) {
      if (tab.plugin?.id !== record.declaration.id) continue;
      const slice = readSlice(
        port, tab.label, tab.plugin.instanceKey, tab.plugin.payload, record.declaration,
      );
      const print = fingerprint(slice);
      const runtime = tabRuntime(tab);
      if (runtime.hostStatePushed === print) continue;
      // Recorded before the call, for two reasons. A delivery re-enters this function: the plugin's
      // handler merges rows with `updateTab`, which emits `state: dirty` inline, and `messageBus.emit`
      // is synchronous, so a tab not yet marked would be delivered again for as long as it keeps
      // emitting. And a handler that throws must not leave the tab looking stale and retrying on every
      // subsequent mutation for the rest of the session.
      runtime.hostStatePushed = print;
      void deliver(port, record, slice);
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