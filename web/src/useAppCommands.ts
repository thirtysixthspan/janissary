import { useCallback } from 'react';
import type { JanusClient } from './shared/ws/ws';

export function useAppCommands(client: JanusClient) {
  const runCommand = useCallback(
    (text: string, tab?: string) => client.send({ method: 'command', params: { text, ...(tab && { tab }) } }),
    [client],
  );
  const reportBlockedCommand = useCallback((text: string, tab: string) => {
    client.send({ method: 'reportBlockedCommand', params: { text, tab } });
  }, [client]);
  const onQuit = useCallback(() => runCommand('quit'), [runCommand]);
  return { runCommand, reportBlockedCommand, onQuit };
}
