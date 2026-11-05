import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type { ConnectionsTopicAction } from './api-topics-connections.js';
import { connectionsTopicAction } from './connections-topic-actions.js';
import { composeConnectionsTopicData } from './connections-topic-rows.js';

const NOTIFICATION_WINDOW_MS = 100;
const requestedWindows = new WeakMap<Managers, Map<string, number>>();

function requestedFor(managers: Managers): Map<string, number> {
  let requested = requestedWindows.get(managers);
  if (!requested) {
    requested = new Map();
    requestedWindows.set(managers, requested);
  }
  return requested;
}

export function readConnectionsTopic(managers: Managers) {
  return composeConnectionsTopicData(managers, requestedFor(managers));
}

export function runConnectionsTopicAction(managers: Managers, action: ConnectionsTopicAction): string | undefined {
  return connectionsTopicAction(managers, action, requestedFor(managers));
}

export function subscribeConnectionsTopic(fire: () => void): Subscription {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      fire();
    }, NOTIFICATION_WINDOW_MS);
  };
  const connections = messageBus.on('connections', 'changed', schedule);
  const state = messageBus.on('state', 'dirty', schedule);
  return {
    unsubscribe: () => {
      connections.unsubscribe();
      state.unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
