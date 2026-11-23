import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from '../../harness/artifact-name.js';
import { reapFilesOlderThan } from '../../state/reaper.js';

// `.janissary/transcripts/shell/`, beside `.janissary/transcripts/harness/` (harness session
// transcripts). Both are kept across launches and quitting; `reapShellTranscripts`, started from
// `src/main.ts`, deletes those last modified more than `logRetentionInDays` days before launch.
let transcriptDirectory = '';

const DAY_MS = 86_400_000;

export function initShellTranscriptDirectory(projectDirectory: string): void {
  transcriptDirectory = path.join(projectDirectory, '.janissary', 'transcripts', 'shell');
}

export function ensureShellTranscriptDirectory(): void {
  mkdirSync(transcriptDirectory, { recursive: true });
}

// The absolute `.txt` path for a shell session started at `startedAt`.
export function shellTranscriptPath(label: string, startedAt: number): string {
  return path.join(transcriptDirectory, harnessArtifactFilename(label, startedAt, '.txt'));
}

export async function reapShellTranscripts(launchedAt: number, days: number): Promise<void> {
  if (!transcriptDirectory) return;
  // The cutoff is `days` days before launch, so only files last modified earlier than that are reaped.
  await reapFilesOlderThan(transcriptDirectory, '.txt', launchedAt - days * DAY_MS);
}
