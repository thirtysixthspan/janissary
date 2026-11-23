import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from '../artifact-name.js';
import { reapFilesOlderThanDays } from '../../state/retention.js';

// Captures are kept across launches; `reapHarnessCaptures`, started from `src/main.ts`, deletes
// those last modified more than `logRetentionInDays` days before launch.
let captureDirectory = '';

export function initHarnessCaptureDirectory(projectDirectory: string): void {
  captureDirectory = path.join(projectDirectory, '.janissary', 'captures');
}

export function ensureCaptureDirectory(): void {
  mkdirSync(captureDirectory, { recursive: true });
}

// Write a screen capture for the tab labeled `label` to `<label>-<capturedAt-iso>.txt` and return
// the absolute path, named by the shared harness artifact builder.
export function writeCaptureFile(label: string, capturedAt: number, text: string): string {
  const file = path.join(captureDirectory, harnessArtifactFilename(label, capturedAt, '.txt'));
  ensureCaptureDirectory();
  writeFileSync(file, text);
  return file;
}

export async function reapHarnessCaptures(launchedAt: number, days: number): Promise<void> {
  await reapFilesOlderThanDays(captureDirectory, '.txt', launchedAt, days);
}
