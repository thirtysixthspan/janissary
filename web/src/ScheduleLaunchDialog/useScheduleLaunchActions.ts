import { useCallback } from 'react';
import type { JanusClient } from '../shared/ws/ws';
import { buildScheduleCommand, type ScheduleFields } from './schedule-command';
import { isValid } from './schedule-validity';

export function useScheduleLaunchActions(client: JanusClient, fields: ScheduleFields) {
  const cancel = useCallback(() => {
    client.send({ method: 'closeScheduleLaunch', params: {} });
  }, [client]);

  const create = useCallback(() => {
    client.send({ method: 'command', params: { text: buildScheduleCommand(fields) } });
    client.send({ method: 'closeScheduleLaunch', params: {} });
  }, [client, fields]);

  return { cancel, create, canSubmit: isValid(fields) };
}
