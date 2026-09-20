import type { ServerFrame } from './protocol.js';

export const REPLAY_HISTORY_CHARS = 128 * 1024;
const RESET = '\u{1B}c';
const TRIMMED = '\r\n[earlier remote history trimmed]\r\n';
type Entry = { id?: string; text: string };

class HistoryBuffer {
  entries: Entry[] = [];
  private size = 0;
  truncated = false;

  forget(id: string): void {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.size = this.entries.reduce((sum, entry) => sum + entry.text.length, 0);
  }

  clear(): void {
    this.entries = [];
    this.size = 0;
    this.truncated = false;
  }

  append(entry: Entry): void {
    if (!entry.text) return;
    this.entries.push(entry);
    this.size += entry.text.length;
    while (this.size > REPLAY_HISTORY_CHARS) {
      const first = this.entries[0];
      const removed = Math.min(first.text.length, this.size - REPLAY_HISTORY_CHARS);
      if (removed === first.text.length) this.entries.shift();
      else first.text = first.text.slice(removed);
      this.size -= removed;
      this.truncated = true;
    }
  }
}

export class ReplayHistory {
  private terminals = new HistoryBuffer();
  private transcript = new HistoryBuffer();

  get truncated(): boolean { return this.terminals.truncated || this.transcript.truncated; }

  record(frame: Extract<ServerFrame, { type: 'output' | 'transcript' }>): void {
    if (frame.type === 'output') this.terminals.append({ id: frame.id, text: frame.data });
    else for (const text of frame.blocks) this.transcript.append({ text });
  }

  forget(id: string): void { this.terminals.forget(id); }

  frames(restore: boolean): ServerFrame[] {
    const terminals = new Map<string, string[]>();
    for (const entry of this.terminals.entries) {
      if (entry.id === undefined) continue;
      const chunks = terminals.get(entry.id) ?? [];
      chunks.push(entry.text);
      terminals.set(entry.id, chunks);
    }
    const frames: ServerFrame[] = [...terminals].map(([id, chunks]) => ({
      type: 'output', id, data: RESET + (this.terminals.truncated ? TRIMMED : '') + chunks.join(''),
    }));
    const blocks = this.transcript.entries.map((entry) => entry.text);
    if (restore && blocks.length > 0) frames.push({ type: 'transcript', blocks });
    return frames;
  }

  clear(): void {
    this.terminals.clear();
    this.transcript.clear();
  }
}
