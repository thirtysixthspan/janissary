import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from './artifact-name.js';

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

export function clearCaptureDirectory(): void {
  if (!captureDirectory) return;
  try { rmSync(captureDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
