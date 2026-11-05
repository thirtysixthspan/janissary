import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { durableRecord } from './model.js';
import { isAcpRecord, isRecordId } from './validation.js';
import type { AcpRecord } from './types.js';

type StoreOptions = {
  projectDir?: string;
  write?: typeof atomicWriteFile;
  remove?: (file: string) => void;
};

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class AcpRecordStore {
  private readonly root: string;
  private readonly writeFile: typeof atomicWriteFile;
  private readonly removeFile: (file: string) => void;
  private readonly warned = new Set<string>();

  constructor(options: StoreOptions = {}) {
    this.root = path.join(options.projectDir ?? process.cwd(), '.janissary', 'connections');
    this.writeFile = options.write ?? atomicWriteFile;
    this.removeFile = options.remove ?? ((file) => { rmSync(file, { force: true }); });
  }

  scan(report: (id: string, error: unknown) => void): AcpRecord[] {
    let entries;
    try {
      entries = readdirSync(this.root, { withFileTypes: true });
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    const records: AcpRecord[] = [];
    for (const entry of entries) {
      const id = entry.name.slice(0, -5);
      if (!entry.isFile() || !entry.name.endsWith('.json') || !isRecordId(id)) continue;
      try {
        const record = this.read(id);
        if (record) records.push(record);
      } catch (error) {
        if (this.warned.has(id)) continue;
        this.warned.add(id);
        report(id, error);
      }
    }
    return records;
  }

  read(id: string): AcpRecord | undefined {
    const file = this.file(id);
    let content: string;
    try {
      if (!lstatSync(file).isFile()) return undefined;
      content = readFileSync(file, 'utf8');
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Invalid or unsupported record');
    }
    if (!isAcpRecord(parsed, id)) throw new Error('Invalid or unsupported record');
    return parsed;
  }

  write(record: AcpRecord): void {
    const file = this.file(record.id);
    mkdirSync(this.root, { recursive: true });
    this.writeFile(file, `${JSON.stringify(durableRecord(record), null, 2)}\n`);
  }

  delete(id: string): void {
    const file = this.file(id);
    try {
      this.removeFile(file);
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }

  private file(id: string): string {
    if (!isRecordId(id)) throw new Error('Invalid ACP record id.');
    return path.join(this.root, `${id}.json`);
  }
}
