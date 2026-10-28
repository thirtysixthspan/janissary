import type { ScheduleEntry } from '../schedule/types.js';

// A one-shot schedule entry that fires `command` once, immediately (as soon as the tab's harness is
// running). This is how a `harness … with …` launch prompt is injected into a freshly opened
// harness tab.
export function oneShotRunEntry(id: string, command: string): ScheduleEntry {
  return { id, command, spec: 'once', nextRun: Date.now(), recurring: false };
}
