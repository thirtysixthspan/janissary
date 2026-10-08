import type { Managers } from '../managers.js';
import type { Subscription } from '../bus.js';
import type { TabPluginDeclaration } from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { BackgroundDeliveryPort } from './background-delivery.js';
import { subscribeTabPluginNotifications } from './notifications.js';
import { subscribeTabPluginHostState } from './host-state.js';
import type { PluginRecord } from './status.js';

// The one thing both delivery modules share: the guarded, deadline-bounded call path the host owns,
// and the way it disables a plugin. Passed in rather than reached for, so their delivery policy stays
// theirs and this module stays free of the host's own state.
type GuardedCall = BackgroundDeliveryPort['invoke'];

// Every subscription the host takes out on behalf of its plugins, in one place. The host owns only
// their lifetime; each channel's delivery policy belongs to the module that owns it. A build in which
// no plugin wants a channel takes no subscription for it at all.
export function subscribeHostChannels(
  port: {
    managers: Managers;
    records(): readonly PluginRecord[];
    invoke: GuardedCall;
    disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): void;
  },
  declarations: readonly TabPluginDeclaration[],
  timeouts: { notifyMs: number; hostStateMs: number },
): Subscription[] {
  const { managers } = port;
  const notifications = subscribeTabPluginNotifications(
    { ...port, timeoutMs: timeouts.notifyMs },
    declarations.flatMap((declaration) => declaration.notifications ?? []),
  );
  const hostState = subscribeTabPluginHostState({
    ...port,
    timeoutMs: timeouts.hostStateMs,
    connectionsFor: (label) => managers.connection.connectionsFor(label),
    scheduleView: (label) => managers.schedule.view(label),
  });
  return [...notifications, ...hostState];
}