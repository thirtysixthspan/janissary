import { ClaudeTranscriptSource } from './claude.js';
import { CodexTranscriptSource } from './codex.js';
import { OpencodeTranscriptSource } from './opencode.js';
import type { TranscriptSource } from './source.js';

// The adapter for a harness, or undefined for one whose session storage this feature does not read.
// A tab with no adapter keeps exactly its existing behavior: screen snapshots to monitors and no
// transcript file.
export function createTranscriptSource(harness: string, cwd: string, spawnedAt: number): TranscriptSource | undefined {
  switch (harness) {
    case 'claude': { return new ClaudeTranscriptSource(cwd, spawnedAt); }
    case 'codex': { return new CodexTranscriptSource(cwd, spawnedAt); }
    case 'opencode': { return new OpencodeTranscriptSource(cwd, spawnedAt); }
    default: { return undefined; }
  }
}
