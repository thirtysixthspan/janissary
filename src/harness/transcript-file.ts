import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';
import { reapFilesOlderThanDays } from '../state/retention.js';

// `.janissary/transcripts/harness/`, beside `.janissary/transcripts/shell/` (shell session
// transcripts). Transcripts are kept across launches and quitting; `reapHarnessTranscripts`,
// started from `src/main.ts`, deletes those last modified more than `logRetentionInDays` days before launch.
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

export async function reapHarnessTranscripts(launchedAt: number, days: number): Promise<void> {
  await reapFilesOlderThanDays(transcriptDirectory, '.txt', launchedAt, days);
}
