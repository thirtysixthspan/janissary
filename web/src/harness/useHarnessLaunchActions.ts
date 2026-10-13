import { useCallback } from 'react';
import type { JanusClient } from '../shared/ws/ws';
import { buildHarnessLaunchCommand, type HarnessLaunchFields } from './harness-launch-command';

export function useHarnessLaunchActions(client: JanusClient, fields: HarnessLaunchFields) {
  const cancel = useCallback(() => {
    client.send({ method: 'closeHarnessLaunch', params: {} });
  }, [client]);

  const create = useCallback(() => {
    client.send({ method: 'command', params: { text: buildHarnessLaunchCommand(fields) } });
    client.send({ method: 'closeHarnessLaunch', params: {} });
  }, [client, fields]);

  return { cancel, create };
}
