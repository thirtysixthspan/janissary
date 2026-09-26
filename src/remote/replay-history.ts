import type { ServerFrame, ShellHistoryRun } from './protocol-frames.js';

export const REPLAY_HISTORY_CHARS = 128 * 1024;
const RESET = '\u{1B}c';
const TRIMMED = '\r\n[earlier remote history trimmed]\r\n';
// `input` marks text the local side wrote to a piped process, retained beside that process's output
// so an attach rebuilding tabs can show each command with what it produced. Absent for a `pty`
// process, whose tty echoed its input into the output already.
type Entry = { id?: string; text: string; input?: true };

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

// Consecutive entries travelling the same way become one run, so a command's output arriving in
// twenty chunks replays as one run rather than twenty.
function runsOf(entries: Entry[]): ShellHistoryRun[] {
  const runs: ShellHistoryRun[] = [];
  for (const entry of entries) {
    const source = entry.input === true ? 'input' : 'output';
    const last = runs.at(-1);
    if (last?.source === source) last.text += entry.text;
    else runs.push({ source, text: entry.text });
  }
  return runs;
}

export class ReplayHistory {
  private terminals = new HistoryBuffer();
  private transcript = new HistoryBuffer();

  get truncated(): boolean { return this.terminals.truncated || this.transcript.truncated; }

  record(frame: Extract<ServerFrame, { type: 'output' | 'transcript' }>): void {
    if (frame.type === 'output') this.terminals.append({ id: frame.id, text: frame.data });
    else for (const text of frame.blocks) this.transcript.append({ text });
  }

  // What the local side wrote to a piped process. Retained in the same buffer as that process's
  // output, and so in the same order the far side saw the two: the order is what pairs a command with
  // the output it produced.
  recordInput(id: string, data: string): void {
    this.terminals.append({ id, text: data, input: true });
  }

  forget(id: string): void { this.terminals.forget(id); }

  frames(restore: boolean): ServerFrame[] {
    const frames: ServerFrame[] = [...this.terminalFrames(restore)];
    const blocks = this.transcript.entries.map((entry) => entry.text);
    if (restore && blocks.length > 0) frames.push({ type: 'transcript', blocks });
    return frames;
  }

  // One frame per process id, in the order the ids were first heard from. A piped shell whose input
  // was retained replays as `shell-history` so the local side can rebuild a transcript entry per
  // command; everything else replays as the single redraw-able output frame it always has, which is
  // also what an automatic reconnect gets — its tabs are open and mid-command, and the recorded input
  // carries the sentinel text their output scan would match.
  private terminalFrames(restore: boolean): ServerFrame[] {
    const grouped = new Map<string, Entry[]>();
    for (const entry of this.terminals.entries) {
      if (entry.id === undefined) continue;
      if (entry.input === true && !restore) continue;
      grouped.set(entry.id, [...grouped.get(entry.id) ?? [], entry]);
    }
    const prefix = RESET + (this.terminals.truncated ? TRIMMED : '');
    return [...grouped].map(([id, entries]) => {
      if (entries.some((entry) => entry.input === true)) {
        return { type: 'shell-history', id, runs: historyRuns(entries, this.terminals.truncated) };
      }
      return { type: 'output', id, data: prefix + entries.map((entry) => entry.text).join('') };
    });
  }

  clear(): void {
    this.terminals.clear();
    this.transcript.clear();
  }
}

// A trimmed history says so in the restored transcript, the way a trimmed terminal replay does. It
// leads the runs as output, so it reads as a line of history rather than as something typed.
function historyRuns(entries: Entry[], truncated: boolean): ShellHistoryRun[] {
  const runs = runsOf(entries);
  return truncated ? [{ source: 'output', text: TRIMMED }, ...runs] : runs;
}
