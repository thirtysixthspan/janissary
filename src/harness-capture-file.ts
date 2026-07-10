import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

let captureDirectory = '';

export function initHarnessCaptureDirectory(projectDirectory: string): void {
  captureDirectory = path.join(projectDirectory, '.janissary', 'captures');
}

export function ensureCaptureDirectory(): void {
  mkdirSync(captureDirectory, { recursive: true });
}

// Write a screen capture for the tab labeled `label` to `<label>-<capturedAt-iso>.txt` and return
// the absolute path. The label is sanitized rather than rejected — the tab exists, so its label is
// legitimate even when it holds filename-hostile characters (`/`, `.`).
export function writeCaptureFile(label: string, capturedAt: number, text: string): string {
  const safeLabel = label.replaceAll(/[^\w-]/g, '-');
  const timestamp = new Date(capturedAt).toISOString().replaceAll(/[:.]/g, '-');
  const file = path.join(captureDirectory, `${safeLabel}-${timestamp}.txt`);
  ensureCaptureDirectory();
  writeFileSync(file, text);
  return file;
}

export function clearCaptureDirectory(): void {
  if (!captureDirectory) return;
  try { rmSync(captureDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
