import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';

// `.janissary/harness-transcripts/`, deliberately not `.janissary/transcripts/` — that directory
// belongs to `TranscriptStore`'s per-tab `<label>.json` logs, an unrelated concept. Same
// init/ensure/path/clear quartet as `recording-file.ts`, so the transcript files inherit the same
// clear-at-fresh-launch / preserve-across-`--relaunch` policy from `src/main.ts`.
let transcriptDirectory = '';

export function initHarnessTranscriptDirectory(projectDirectory: string): void {
  transcriptDirectory = path.join(projectDirectory, '.janissary', 'harness-transcripts');
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
