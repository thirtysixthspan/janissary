import type { ConnectionStatus } from './useConnectionStatus';

const labels = {
  connected: '', reconnecting: 'Reconnecting…', escalated: 'Cannot reach session', reconnected: 'Reconnected',
};

export function ConnectionStatusLabel({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;
  return <div role="status" className="connection-status">{labels[status]}</div>;
}
