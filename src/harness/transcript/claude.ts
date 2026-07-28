import { homedir } from 'node:os';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { JsonlTail } from './jsonl-tail.js';
import { normalizeClaudeRecord, type ToolNames } from './normalize.js';
import { withSource } from './render.js';
import { asRecord, asString } from './json.js';
import type { TranscriptSource } from './source.js';

// claude keeps one `.jsonl` per session under `~/.claude/projects/<cwd-slug>/`, and a session that
// dispatched subagents gets a sibling `<session-uuid>/subagents/` directory holding one `.jsonl` per
// subagent plus its `.meta.json`. Those subagent files are the whole point of the feature: their
// prompts and tool calls never render on the parent's terminal, so no screen snapshot can carry them.
export class ClaudeTranscriptSource implements TranscriptSource {
  private parent: JsonlTail | undefined;
  private subagentDirectory = '';
  private subagents = new Map<string, { tail: JsonlTail; label: string | undefined }>();
  private toolNames: ToolNames = new Map();

  constructor(private cwd: string, private spawnedAt: number, private home: string = homedir()) {}

  resolved(): boolean {
    return this.parent !== undefined;
  }

  poll(): string[] {
    if (!this.parent) this.resolve();
    if (!this.parent) return [];
    const blocks = this.render(this.parent.read(), undefined);
    this.discoverSubagents();
    for (const { tail, label } of this.subagents.values()) {
      blocks.push(...this.render(tail.read(), label));
    }
    return blocks;
  }

  private render(records: Record<string, unknown>[], label: string | undefined): string[] {
    const blocks: string[] = [];
    for (const record of records) {
      const rendered = normalizeClaudeRecord(record, this.toolNames);
      if (rendered) blocks.push(withSource(label, rendered));
    }
    return blocks;
  }

  // The session file is the one in this cwd's project directory whose mtime first post-dates the
  // PTY spawn — the spawn is the floor, so an earlier session in the same directory is never picked
  // up (decision 8: the tab's own session only).
  private resolve(): void {
    const directory = path.join(this.home, '.claude', 'projects', claudeProjectSlug(this.cwd));
    let candidates: { file: string; modified: number }[];
    try {
      candidates = readdirSync(directory)
        .filter((entry) => entry.endsWith('.jsonl'))
        .map((entry) => ({ file: path.join(directory, entry), modified: statSync(path.join(directory, entry)).mtimeMs }))
        .filter((entry) => entry.modified >= this.spawnedAt)
        .toSorted((a, b) => a.modified - b.modified);
    } catch {
      return;
    }
    const chosen = candidates[0];
    if (!chosen) return;
    this.parent = new JsonlTail(chosen.file);
    this.subagentDirectory = path.join(directory, path.basename(chosen.file, '.jsonl'), 'subagents');
  }

  // Subagent files appear over the session's life, so the directory is re-scanned on every poll and
  // each newly seen `agent-*.jsonl` starts its own tail.
  private discoverSubagents(): void {
    let entries: string[];
    try {
      entries = readdirSync(this.subagentDirectory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.startsWith('agent-') || !entry.endsWith('.jsonl') || this.subagents.has(entry)) continue;
      const file = path.join(this.subagentDirectory, entry);
      this.subagents.set(entry, { tail: new JsonlTail(file), label: subagentLabel(file) });
    }
  }
}

// `~/.claude/projects/` names a directory after the cwd with every path separator and `.` replaced
// by `-`, so `/home/me/.config/app` becomes `-home-me--config-app`.
export function claudeProjectSlug(cwd: string): string {
  return cwd.replaceAll(/[/\\.]/g, '-');
}

// A subagent's identity from the `.meta.json` beside its `.jsonl`: its agent type and the
// description it was dispatched with. A subagent file with no meta file is still tailed — its
// entries simply carry no label.
function subagentLabel(file: string): string | undefined {
  try {
    const meta = asRecord(JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')));
    const parts = [asString(meta?.agentType), asString(meta?.description)].filter(Boolean);
    return parts.length > 0 ? parts.join(': ') : undefined;
  } catch {
    return undefined;
  }
}
