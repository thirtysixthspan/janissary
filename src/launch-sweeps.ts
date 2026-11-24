import { reapHarnessCaptures } from './harness/capture/file.js';
import { reapHarnessRecordings } from './harness/recording-file.js';
import { reapHarnessTranscripts } from './harness/transcript-file.js';
import { reapShellTranscripts } from './shell/transcript/transcript-file.js';
import { reapActivityLogs } from './activity-log/logger.js';

const SWEEPS = [reapHarnessCaptures, reapHarnessRecordings, reapHarnessTranscripts, reapShellTranscripts, reapActivityLogs];

export function startLaunchSweeps(launchedAt: number, days: number): void {
  for (const sweep of SWEEPS) void sweep(launchedAt, days).catch(() => {});
}
