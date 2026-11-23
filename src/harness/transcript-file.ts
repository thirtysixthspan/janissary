import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';

// `.janissary/transcripts/harness/`, the only thing under `.janissary/transcripts/`. The
// clear-at-every-launch policy comes from this directory's entry in `src/state/dirs.ts`.
let transcriptDirectory = '';

export function initHarnessTranscriptDirectory(projectDirectory: string): void {
  transcriptDirectory = path.join(projectDirectory, '.janissary', 'transcripts', 'harness');
}

export function ensureHarnessTranscriptDirectory(): void {
  mkdirSync(transcriptDirectory, { recursive: true });
}

// The absolute `.txt` path for a session started at `startedAt`.
export function harnessTranscriptPath(label: string, startedAt: number): string {
  return path.join(transcriptDirectory, harnessArtifactFilename(label, startedAt, '.txt'));
}

export function clearHarnessTranscriptDirectory(): void {
  if (!transcriptDirectory) return;
  try { rmSync(transcriptDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
