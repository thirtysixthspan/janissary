import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';

let recordingDirectory = '';

export function initHarnessRecordingDirectory(projectDirectory: string): void {
  recordingDirectory = path.join(projectDirectory, '.janissary', 'recordings');
}

export function ensureRecordingDirectory(): void {
  mkdirSync(recordingDirectory, { recursive: true });
}

// The absolute `.cast` path for a session started at `startedAt`, named by the shared harness
// artifact builder.
export function harnessRecordingPath(label: string, startedAt: number): string {
  return path.join(recordingDirectory, harnessArtifactFilename(label, startedAt, '.cast'));
}

export function clearHarnessRecordingDirectory(): void {
  if (!recordingDirectory) return;
  try { rmSync(recordingDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
