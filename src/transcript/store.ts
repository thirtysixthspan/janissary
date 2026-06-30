import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { LogEntry } from '../types.js';
import { messageBus } from '../bus.js';

const VALID_NAME = /^[\w-]+$/;

let transcriptDir = '';

// Subscribes to the bus and persists transcript files whenever entries are appended or a tab is
// cleared. tab:removed keeps the file for history. In-place edits (streaming, runShell completion)
// are persisted by direct calls to save() from the controller since there is no bus event for them.
export class TranscriptStore {
  private static path(label: string): string {
    if (!VALID_NAME.test(label)) throw new Error(`Invalid transcript label: "${label}"`);
    return path.join(transcriptDir, `${label}.json`);
  }

  static load(label: string): LogEntry[] | undefined {
    if (!transcriptDir) return undefined;
    const p = this.path(label);
    if (!existsSync(p)) return undefined;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as LogEntry[];
    } catch {
      return undefined;
    }
  }

  static save(label: string, log: readonly LogEntry[]): void {
    if (!transcriptDir) return;
    try {
      mkdirSync(transcriptDir, { recursive: true });
      writeFileSync(this.path(label), JSON.stringify(log));
    } catch { /* ignore */ }
  }

  static clearTab(label: string): void {
    if (!transcriptDir) return;
    try {
      mkdirSync(transcriptDir, { recursive: true });
      writeFileSync(this.path(label), '[]');
    } catch { /* ignore */ }
  }

  static clear(): void {
    if (!transcriptDir) return;
    try { rmSync(transcriptDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  constructor(projectDir?: string) {
    if (projectDir) transcriptDir = path.join(projectDir, '.janissary', 'transcripts');
    messageBus.on('transcript', 'entry:appended', (event) => {
      if (event.type === 'entry:appended') TranscriptStore.save(event.tabLabel, event.tab.log);
    });
    messageBus.on('transcript', 'tab:cleared', (event) => {
      if (event.type === 'tab:cleared') TranscriptStore.clearTab(event.tabLabel);
    });
  }
}
