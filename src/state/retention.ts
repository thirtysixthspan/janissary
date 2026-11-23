import { reapFilesOlderThan } from './reaper.js';

const DAY_MS = 86_400_000;

export async function reapFilesOlderThanDays(directory: string, extension: string, launchedAt: number, days: number): Promise<void> {
  if (!directory) return;
  await reapFilesOlderThan(directory, extension, launchedAt - days * DAY_MS);
}
