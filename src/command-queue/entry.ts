export type SystemScheduleOrigin = {
  kind: 'system-schedule';
  scheduleKey: string;
};

export type QueueEntry = string | {
  line: string;
  origin: SystemScheduleOrigin;
};

export function queueEntryLine(entry: QueueEntry): string {
  return typeof entry === 'string' ? entry : entry.line;
}

export function queueEntryOrigin(entry: QueueEntry): SystemScheduleOrigin | undefined {
  return typeof entry === 'string' ? undefined : entry.origin;
}

export function ordinaryQueueEntry(entry: QueueEntry): string {
  return queueEntryLine(entry);
}
