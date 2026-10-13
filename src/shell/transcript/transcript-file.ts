import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from '../../harness/artifact-name.js';

// `.janissary/shell-transcripts/`, distinct from `.janissary/transcripts/` (`TranscriptStore`'s
// per-tab `<label>.json` logs) and from `.janissary/harness-transcripts/` (harness session
// transcripts). The clear-at-fresh-launch / preserve-across-`--relaunch` policy comes from this
// directory's entry in `src/state/dirs.ts`.
let transcriptDirectory = '';

export function initShellTranscriptDirectory(projectDirectory: string): void {
  transcriptDirectory = path.join(projectDirectory, '.janissary', 'shell-transcripts');
}

export function ensureShellTranscriptDirectory(): void {
  mkdirSync(transcriptDirectory, { recursive: true });
}

// The absolute `.txt` path for a shell session started at `startedAt`.
export function shellTranscriptPath(label: string, startedAt: number): string {
  return path.join(transcriptDirectory, harnessArtifactFilename(label, startedAt, '.txt'));
}

export function clearShellTranscriptDirectory(): void {
  if (!transcriptDirectory) return;
  try { rmSync(transcriptDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
