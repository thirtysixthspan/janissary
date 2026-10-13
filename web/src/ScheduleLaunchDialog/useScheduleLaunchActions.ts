import { useCallback } from 'react';
import type { JanusClient } from '../shared/ws/ws';
import { buildScheduleCommand, type ScheduleFields } from './schedule-command';

function isValid(fields: ScheduleFields): boolean {
  if (!fields.name.trim() || !fields.command.trim()) return false;
  switch (fields.type) {
    case 'at': { return fields.time.trim() !== ''; }
    case 'on': { return fields.date.trim() !== ''; }
    case 'every': { return fields.interval.trim() !== ''; }
    case 'everyDay': { return fields.time.trim() !== ''; }
    case 'everyWeekday': { return fields.time.trim() !== ''; }
  }
}

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
