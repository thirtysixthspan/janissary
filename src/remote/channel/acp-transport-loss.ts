import type { AcpSessionListener } from './acp.js';

export function settleAcpTransportLoss(sessions: Map<string, AcpSessionListener>): void {
  const listeners = [...sessions.values()];
  sessions.clear();
  for (const listener of listeners) {
    if (listener.onTransportLost) listener.onTransportLost();
    else listener.onError('Remote connection lost.', true);
  }
}
