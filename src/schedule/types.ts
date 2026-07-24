export type TimeOfDay = { hour: number; minute: number };

export type ScheduleEntry = {
  id: string; // 's1', 's2', ...
  command: string; // raw command text to dispatch
  spec: string; // human-readable schedule, e.g. "every 5m", "every day at 3:35pm"
  nextRun: number; // epoch ms of the next execution
  recurring: boolean;
  intervalMs?: number; // interval recurrence
  timeOfDay?: TimeOfDay; // clock-time recurrence
  weekday?: number; // 0-6 (Sun-Sat) when "every <weekday>"
};

// `target` carries the optional `in <tab>` clause: the label of the tab the operation
// applies to (defaulting to the issuing tab when absent).
export type ScheduleParseResult =
  | { action: 'add'; entry: Omit<ScheduleEntry, 'id'>; name: string; target?: string }
  | { action: 'list'; target?: string }
  | { action: 'cancel'; id: string; target?: string }
  | { action: 'clear'; target?: string }
  | { error: string };
