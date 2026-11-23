import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';
import { reapFilesOlderThan } from '../state/reaper.js';

// Recordings are kept across launches and quitting; `reapHarnessRecordings`, started from
// `src/main.ts`, deletes those last modified more than `logRetentionInDays` days before launch.
let recordingDirectory = '';

const DAY_MS = 86_400_000;

export function initHarnessRecordingDirectory(projectDirectory: string): void {
  recordingDirectory = path.join(projectDirectory, '.janissary', 'recordings');
}

export function ensureRecordingDirectory(): void {
  mkdirSync(recordingDirectory, { recursive: true });
}

// The directory recordings are written into, or the empty string before initialization. Published so
// a reader of those files — `play` searching it for a recording of a given name — learns the path from
// the module that owns it rather than re-deriving it from the project directory.
export function harnessRecordingDirectory(): string {
  return recordingDirectory;
}

// The absolute `.cast` path for a session started at `startedAt`, named by the shared harness
// artifact builder.
export function harnessRecordingPath(label: string, startedAt: number): string {
  return path.join(recordingDirectory, harnessArtifactFilename(label, startedAt, '.cast'));
}

export async function reapHarnessRecordings(launchedAt: number, days: number): Promise<void> {
  if (!recordingDirectory) return;
  // The cutoff is `days` days before launch, so only files last modified earlier than that are reaped.
  await reapFilesOlderThan(recordingDirectory, '.cast', launchedAt - days * DAY_MS);
}
