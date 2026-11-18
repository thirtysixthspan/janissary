import type { SubagentDelivery } from '../subagent/messages.js';

export function enqueueSubagentMessage(
  pending: readonly SubagentDelivery[],
  incoming: SubagentDelivery,
): SubagentDelivery[] {
  const remaining = incoming.message.status === 'started'
    ? [...pending]
    : pending.filter((entry) => !(entry.runId === incoming.runId && entry.message.status === 'started'));
  return [...remaining, incoming];
}
