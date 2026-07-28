import { homedir } from 'node:os';
import { readdirSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import path from 'node:path';
import { JsonlTail } from './jsonl-tail.js';
import { normalizeCodexRecord, type ToolNames } from './normalize.js';
import { asRecord, asString, parseRecordLine } from './json.js';
import type { TranscriptSource } from './source.js';

// How much of a rollout file to read when checking its `session_meta` header — the first record is
// small, and reading the whole file just to identify it would be wasteful on a long session.
const HEADER_BYTES = 64 * 1024;

// codex writes one rollout file per session under `~/.codex/sessions/<YYYY>/<MM>/<DD>/`, named at
// session start. The directory scanned is therefore the **spawn** date's, not today's: a tab open
// across local midnight must still find the file codex named when the session began.
export class CodexTranscriptSource implements TranscriptSource {
  private tail: JsonlTail | undefined;
  private toolNames: ToolNames = new Map();

  constructor(private cwd: string, private spawnedAt: number, private home: string = homedir()) {}

  resolved(): boolean {
    return this.tail !== undefined;
  }

  poll(): string[] {
    if (!this.tail) this.resolve();
    if (!this.tail) return [];
    const blocks: string[] = [];
    for (const record of this.tail.read()) {
      const rendered = normalizeCodexRecord(record, this.toolNames);
      if (rendered) blocks.push(rendered);
    }
    return blocks;
  }

  // A rollout file belongs to this tab when it was created after the PTY spawned and its
  // `session_meta` header names this tab's cwd. Several codex sessions can share a day directory,
  // so the cwd match — not just the timestamp — is what identifies the session.
  private resolve(): void {
    for (const file of this.candidates()) {
      if (sessionMetaCwd(file) === this.cwd) {
        this.tail = new JsonlTail(file);
        return;
      }
    }
  }

  private candidates(): string[] {
    const spawn = new Date(this.spawnedAt);
    const day = [
      String(spawn.getFullYear()),
      String(spawn.getMonth() + 1).padStart(2, '0'),
      String(spawn.getDate()).padStart(2, '0'),
    ];
    const directory = path.join(this.home, '.codex', 'sessions', ...day);
    try {
      return readdirSync(directory)
        .filter((entry) => entry.startsWith('rollout-') && entry.endsWith('.jsonl'))
        .map((entry) => ({ file: path.join(directory, entry), created: createdAt(path.join(directory, entry)) }))
        .filter((entry) => entry.created >= this.spawnedAt)
        .toSorted((a, b) => a.created - b.created)
        .map((entry) => entry.file);
    } catch {
      return [];
    }
  }
}

// When a rollout file came into existence. Filesystems that do not record a birth time report it as
// 0, so the modification time stands in — for a file being appended to that is an upper bound, which
// still keeps a pre-spawn session out.
function createdAt(file: string): number {
  try {
    const stats = statSync(file);
    return stats.birthtimeMs || stats.mtimeMs;
  } catch {
    return 0;
  }
}

// The cwd a rollout file's leading `session_meta` record declares, or undefined when the file has no
// readable header yet (codex writes it at session start, but a poll can land in between).
function sessionMetaCwd(file: string): string | undefined {
  const header = readHeader(file);
  if (header === undefined) return undefined;
  const record = parseRecordLine(header.split('\n', 1)[0]);
  if (!record || asString(record.type) !== 'session_meta') return undefined;
  const payload = asRecord(record.payload);
  return asString(payload?.cwd) ?? asString(record.cwd);
}

function readHeader(file: string): string | undefined {
  const buffer = Buffer.alloc(HEADER_BYTES);
  let handle: number | undefined;
  try {
    handle = openSync(file, 'r');
    const read = readSync(handle, buffer, 0, HEADER_BYTES, 0);
    return buffer.subarray(0, read).toString('utf8');
  } catch {
    return undefined;
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}
