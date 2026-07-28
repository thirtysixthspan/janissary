import { createWriteStream, type WriteStream } from 'node:fs';
import { ensureHarnessTranscriptDirectory, harnessTranscriptPath } from '../transcript-file.js';
import type { TranscriptSource } from './source.js';

// How often a tab's session record is re-read, and how long resolution is given before the tab is
// left with screen snapshots alone. A harness creates its session record on its first turn, not at
// spawn, so resolution rides these ordinary ticks rather than a second retry loop.
const POLL_INTERVAL_MS = 2000;
const RESOLVE_DEADLINE_MS = 120_000;

// The third per-PTY observer, beside `HarnessScreenReader` and `HarnessRecorder`: it follows the
// session record the harness binary writes to its own dot directory and turns it into normalized
// text. It accumulates for the tab's whole life whether or not anything is watching, so a monitor
// started mid-session finds a populated buffer and `harness transcript` works on an unmonitored tab.
//
// The `.janissary/harness-transcripts/` file is opened lazily on the first entry (a harness that
// never produces one leaves no empty file) through a single long-lived append stream, exactly as
// `HarnessRecorder` does.
export class HarnessTranscriptTailer {
  private timer: NodeJS.Timeout | undefined;
  private entries: string[] = [];
  private stream: WriteStream | undefined;
  private file: string | undefined;
  private readonly startedAt = Date.now();
  private disposed = false;
  private notified = false;

  constructor(
    private label: string,
    private source: TranscriptSource,
    private onUnavailable: () => void,
  ) {
    this.timer = setInterval(() => { this.tick(); }, POLL_INTERVAL_MS);
    this.timer.unref();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopPolling();
    this.stream?.end();
    this.stream = undefined;
  }

  // The entries this tab has accumulated after `index`. Callers keep their own index, so two
  // monitors watching one tab each receive the whole stream.
  entriesAfter(index: number): string[] {
    return this.entries.slice(Math.max(index, 0));
  }

  // The transcript file's path once anything has been written to it, or undefined while the tab has
  // produced no entries — which is what `harness transcript` reports on.
  transcriptFile(): string | undefined {
    return this.file;
  }

  private tick(): void {
    if (this.disposed) return;
    let blocks: string[];
    try {
      blocks = this.source.poll();
    } catch {
      this.stopPolling();
      return;
    }
    if (blocks.length > 0) this.append(blocks);
    if (!this.source.resolved() && Date.now() - this.startedAt >= RESOLVE_DEADLINE_MS) this.giveUp();
  }

  private append(blocks: string[]): void {
    this.entries.push(...blocks);
    if (!this.stream) this.open();
    this.stream?.write(blocks.map((block) => block + '\n\n').join(''));
  }

  private open(): void {
    try {
      ensureHarnessTranscriptDirectory();
      this.file = harnessTranscriptPath(this.label, this.startedAt);
      const stream = createWriteStream(this.file, { flags: 'a' });
      // A stream's async `'error'` event would otherwise escape and crash the process; entries keep
      // accumulating in memory, they just stop being persisted.
      stream.on('error', () => { this.stream = undefined; });
      this.stream = stream;
    } catch {
      this.file = undefined;
    }
  }

  // Resolution never happened within the deadline: the tab keeps exactly its previous behavior
  // (screen snapshots to monitors, no transcript file) and one line lands in the notifications feed,
  // never repeated.
  private giveUp(): void {
    this.stopPolling();
    if (this.notified) return;
    this.notified = true;
    this.onUnavailable();
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
