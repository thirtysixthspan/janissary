import { useEffect, useState } from 'react';
import type { JanusClient } from './ws';
import type { ConnectionPhase } from './reconnect-policy';

export type ConnectionStatus = ConnectionPhase | 'reconnected';

export function useConnectionStatus(client: JanusClient): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(client.connectionStatus);
  useEffect(() => {
    let previous = client.connectionStatus;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus(previous);
    const unsubscribe = client.onConnectionStatus((phase) => {
      clearTimeout(timer);
      if (phase === 'connected' && previous !== 'connected') {
        setStatus('reconnected');
        timer = setTimeout(() => setStatus('connected'), 2000);
      } else setStatus(phase);
      previous = phase;
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [client]);
  return status;
}
