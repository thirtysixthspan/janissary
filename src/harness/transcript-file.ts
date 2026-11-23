import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';
import { reapFilesOlderThan } from '../state/reaper.js';

// `.janissary/transcripts/harness/`, the only thing under `.janissary/transcripts/`. Transcripts are
// kept across launches and quitting; `reapHarnessTranscripts`, started from `src/main.ts`, deletes
// those last modified more than `logRetentionInDays` days before launch.
let transcriptDirectory = '';

const DAY_MS = 86_400_000;

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

export async function reapHarnessTranscripts(launchedAt: number, days: number): Promise<void> {
  if (!transcriptDirectory) return;
  // The cutoff is `days` days before launch, so only files last modified earlier than that are reaped.
  await reapFilesOlderThan(transcriptDirectory, '.txt', launchedAt - days * DAY_MS);
}
