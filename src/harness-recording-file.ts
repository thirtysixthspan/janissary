import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

let recordingDirectory = '';

export function initHarnessRecordingDirectory(projectDirectory: string): void {
  recordingDirectory = path.join(projectDirectory, '.janissary', 'recordings');
}

export function ensureRecordingDirectory(): void {
  mkdirSync(recordingDirectory, { recursive: true });
}

// The absolute `.cast` path for a session started at `startedAt`. The label is sanitized rather
// than rejected (the tab exists, so its label is legitimate even with filename-hostile characters),
// and the ISO timestamp's `:`/`.` are replaced with `-`, mirroring `writeCaptureFile`.
export function harnessRecordingPath(label: string, startedAt: number): string {
  const safeLabel = label.replaceAll(/[^\w-]/g, '-');
  const timestamp = new Date(startedAt).toISOString().replaceAll(/[:.]/g, '-');
  return path.join(recordingDirectory, `${safeLabel}-${timestamp}.cast`);
}

export function clearHarnessRecordingDirectory(): void {
  if (!recordingDirectory) return;
  try { rmSync(recordingDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
