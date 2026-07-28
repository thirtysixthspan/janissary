import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { parseRecordLine } from './json.js';

// An incremental reader over a JSONL file another process is appending to. It reads only the bytes
// added since the previous call (a positional read from its own offset, never a whole-file re-read —
// a session file grows without bound), and holds back a trailing partial line until its newline
// arrives, because a read routinely lands mid-record.
export class JsonlTail {
  private offset = 0;
  private pending = '';

  constructor(readonly file: string) {}

  // The complete records appended since the last read. A file that has shrunk (rotated or replaced)
  // is treated as a fresh file and read from the start; a read error yields nothing, leaving the
  // offset where it was so the next poll retries.
  read(): Record<string, unknown>[] {
    const size = this.size();
    if (size === undefined) return [];
    if (size < this.offset) {
      this.offset = 0;
      this.pending = '';
    }
    if (size === this.offset) return [];
    const chunk = this.readFrom(size - this.offset);
    if (chunk === undefined) return [];
    const lines = (this.pending + chunk).split('\n');
    this.pending = lines.pop() ?? '';
    return lines.map((line) => parseRecordLine(line)).filter((record) => record !== undefined);
  }

  private size(): number | undefined {
    try {
      return statSync(this.file).size;
    } catch {
      return undefined;
    }
  }

  // Read `length` bytes from the current offset, advancing it by however many bytes actually
  // arrived. A multi-byte character split across two reads is decoded as replacement characters
  // rather than being held back — harmless in rendered text, and not worth a decoder per file.
  private readFrom(length: number): string | undefined {
    const buffer = Buffer.alloc(length);
    let handle: number | undefined;
    try {
      handle = openSync(this.file, 'r');
      const read = readSync(handle, buffer, 0, length, this.offset);
      this.offset += read;
      return buffer.subarray(0, read).toString('utf8');
    } catch {
      return undefined;
    } finally {
      if (handle !== undefined) closeSync(handle);
    }
  }
}
