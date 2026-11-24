import path from 'node:path';
import { reapFilesOlderThan } from '../state/reaper.js';

// Initialization only records the directory: the launcher creates `.janissary/logs` but not
// `.janissary/logs/server`, and a missing directory is a reaper no-op. The one-hour floor keeps a
// just-written log safe even when `logRetentionInDays` is 0.
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

let serverLogDirectory = '';

export function initServerLogDirectory(projectDirectory: string): void {
  serverLogDirectory = path.join(projectDirectory, '.janissary', 'logs', 'server');
}

export async function reapServerLogs(launchedAt: number, days: number): Promise<void> {
  if (!serverLogDirectory) return;
  const retentionCutoff = launchedAt - days * DAY_MS;
  const cutoffMs = Math.min(retentionCutoff, launchedAt - HOUR_MS);
  await reapFilesOlderThan(serverLogDirectory, '.log', cutoffMs);
}
