import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../../atomic-write.js';
import { ensureSystemScheduleExcluded } from './local-exclude.js';
import { decodeSystemScheduleSnapshot } from './store-decode.js';
import type { StoreLoadResult, StoreSaveResult, SystemScheduleSnapshot } from './types.js';

function pathExists(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function validatePath(directory: string, file: string): void {
  for (const candidate of [directory, file]) {
    let stat;
    try {
      stat = lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (candidate === directory) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe system schedule directory: ${directory}`);
    } else if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Unsafe system schedule file: ${file}`);
    }
  }
}

export class SystemScheduleStore {
  readonly file: string;
  private readonly directory: string;
  private unsupportedVersion: number | undefined;

  constructor(private readonly projectRoot: string) {
    this.directory = path.join(projectRoot, '.janissary');
    this.file = path.join(this.directory, 'system-schedules.json');
  }

  load(): StoreLoadResult {
    try {
      validatePath(this.directory, this.file);
      if (!pathExists(this.file)) return { ok: true, snapshot: { version: 1, entries: [] } };
      const decoded = decodeSystemScheduleSnapshot(JSON.parse(readFileSync(this.file, 'utf8')) as unknown);
      this.unsupportedVersion = decoded.ok ? undefined : decoded.kind === 'unsupported-version' ? decoded.version : undefined;
      return decoded;
    } catch (error) {
      return { ok: false, kind: 'invalid', error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  save(snapshot: SystemScheduleSnapshot): StoreSaveResult {
    const decoded = decodeSystemScheduleSnapshot(snapshot);
    if (!decoded.ok) return decoded.kind === 'unsupported-version'
      ? { ok: false, kind: 'unsupported-version', version: decoded.version }
      : { ok: false, kind: 'invalid', error: decoded.error };
    if (this.unsupportedVersion !== undefined) return { ok: false, kind: 'unsupported-version', version: this.unsupportedVersion };
    try {
      validatePath(this.directory, this.file);
      if (pathExists(this.file)) {
        try {
          const current = decodeSystemScheduleSnapshot(JSON.parse(readFileSync(this.file, 'utf8')) as unknown);
          if (!current.ok && current.kind === 'unsupported-version') {
            this.unsupportedVersion = current.version;
            return { ok: false, kind: 'unsupported-version', version: current.version };
          }
        } catch {
          // An explicit valid snapshot may replace malformed JSON.
        }
      }
      ensureSystemScheduleExcluded(this.projectRoot);
      mkdirSync(this.directory, { recursive: true });
      atomicWriteFile(this.file, `${JSON.stringify(decoded.snapshot, null, 2)}\n`);
      return { ok: true };
    } catch (error) {
      return { ok: false, kind: 'io', error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
