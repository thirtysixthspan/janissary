// Schedule-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.

// One row in the floating "schedule" panel.
export type ScheduleView = { id: string; spec: string; next: string; recurring: boolean };
// One row in the aggregated "schedules" tab: a ScheduleView plus its owning tab label and the
// command to run (the per-tab ScheduleView omits the command; the aggregate needs it).
export type AggregatedScheduleView = ScheduleView & { tab: string; command: string };
// The open "New schedule" dialog's data: the eligible target-tab labels (agent + harness tabs)
// and the default (active tab) label. Null in the snapshot when the dialog is closed.
export type ScheduleLaunchView = { targets: string[]; active: string };

export type ScheduleRpcCall =
  // Close the "New schedule" dialog without scheduling (Cancel/Escape, or after a submit).
  { method: 'closeScheduleLaunch'; params: Record<string, never> };
