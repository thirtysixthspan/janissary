import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from '../harness/artifact-name.js';
import { errorText } from '../error-text.js';

let outputDirectory = '';

export function initGitFailureDirectory(projectDirectory: string): void {
  outputDirectory = path.join(projectDirectory, '.janissary', 'git-errors');
}

export function writeGitFailureOutput(label: string, failedAt: number, error: unknown): string | undefined {
  if (!outputDirectory) return undefined;
  const text = errorText(error);
  if (!text.trim().includes('\n')) return undefined;
  const file = path.join(outputDirectory, harnessArtifactFilename(label, failedAt, '.log'));
  try {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(file, text);
    return file;
  } catch {
    return undefined;
  }
}

export function clearGitFailureDirectory(): void {
  if (!outputDirectory) return;
  try { rmSync(outputDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
