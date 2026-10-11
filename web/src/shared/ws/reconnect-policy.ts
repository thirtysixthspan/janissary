export type ConnectionPhase = 'connected' | 'reconnecting' | 'escalated';
export const RECONNECT_ESCALATION_ATTEMPTS = 6;

export function reconnectDelay(attempt: number): number {
  return Math.min(250 * 2 ** Math.min(Math.max(attempt, 0), 5), 5000);
}

export function connectionPhase(attempt: number, connected: boolean): ConnectionPhase {
  if (connected) return 'connected';
  return attempt >= RECONNECT_ESCALATION_ATTEMPTS ? 'escalated' : 'reconnecting';
}
