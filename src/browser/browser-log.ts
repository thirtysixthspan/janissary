import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { harnessArtifactFilename } from '../harness/artifact-name.js';

// The post-mortem of one dead browser, kept as a file so the whole of it survives the bound the
// notification's own message is held to. Modelled on `src/harness/capture-file.ts`, which does the
// same for the screen behind an auto-approved permission prompt, and named through the same shared
// artifact filename builder.

let logDirectory = '';

export function initBrowserLogDirectory(projectDirectory: string): void {
  logDirectory = path.join(projectDirectory, '.janissary', 'browser-logs');
}

export function ensureBrowserLogDirectory(): void {
  mkdirSync(logDirectory, { recursive: true });
}

/**
 * Write a dead browser's full output to `<label>-<endedAt-iso>.log` and return the absolute path,
 * or `undefined` when it could not be written.
 *
 * A failure is swallowed rather than thrown, which is the one way this differs from
 * `writeCaptureFile`. Every caller is already reporting some other failure — a browser that just
 * died — and a full disk or an unwritable project directory must not turn that report into an
 * unhandled throw on the way out. Losing the file costs the link on the notification line; the
 * notification itself, and the bounded tail it carries, are unaffected.
 */
export function writeBrowserLog(label: string, endedAt: number, text: string): string | undefined {
  if (!logDirectory) return undefined;
  const file = path.join(logDirectory, harnessArtifactFilename(label, endedAt, '.log'));
  try {
    ensureBrowserLogDirectory();
    writeFileSync(file, text);
    return file;
  } catch {
    return undefined;
  }
}

export function clearBrowserLogDirectory(): void {
  if (!logDirectory) return;
  try { rmSync(logDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}
