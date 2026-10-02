import { createWriteStream, type WriteStream } from 'node:fs';
import { messageBus, type Subscription } from '../bus.js';
import { ensureRecordingDirectory, harnessRecordingPath } from './recording-file.js';
import { IntervalClock } from './cast-interval-clock.js';
import { castHeader } from './cast-header.js';
import type { TerminalColors } from './terminal-colors.js';

// How long a recording's silence may be before a player compresses it. Written into the header so a
// recording carries the answer with it rather than leaving every player to guess; the value is
// asciinema's own recommended example and `src/harness/cast-header.ts` explains why it is recorded
// rather than merely defaulted.
const IDLE_TIME_LIMIT = 2;

// Records one harness PTY's byte stream to a replayable asciicast v3 `.cast` file. It observes the
// same `pty` bus events as `HarnessScreenReader` (its sibling observer of the same bytes) and, like
// it, is owned/disposed by `HarnessManager`. The file is created lazily on the first `data` event —
// a harness that exits before producing output leaves no empty file. Uses a single long-lived append
// stream (not per-event `appendFileSync`) so a burst of PTY output never blocks `bus.emit`.
//
// `command` is what the asciicast header reports the session ran: a bare program name (`claude`) for a
// named harness, the whole verbatim `ssh …` invocation for an ssh tab. `onFailure` fires at most once
// if recording is abandoned, and is required rather than optional so that a new spawn path cannot
// leave an abandoned recording unreported by simply not passing it.
export class HarnessRecorder {
  private subscription: Subscription;
  private stream: WriteStream | undefined;
  private path: string | undefined;
  private readonly clock = new IntervalClock();
  private colors: TerminalColors | undefined;
  private readonly startedAt = Date.now();
  private disposed = false;
  private failed = false;

  constructor(
    private id: string,
    private label: string,
    private command: string,
    private cols: number,
    private rows: number,
    private onFailure: () => void,
  ) {
    this.subscription = messageBus.on('pty', ['data', 'exit', 'resize'], (event) => {
      if (event.id !== this.id) return;
      if (event.type === 'data') this.onData(event.data);
      else if (event.type === 'resize') this.onResize(event.cols, event.rows);
      else this.onExit(event.exitCode);
    });
  }

  // The file this session is recording to, or nothing until the first output has actually opened it.
  // A tab that has produced nothing has no recording to name, and a tab that has closed has released
  // its runtime along with the path, so this is the only honest answer either can give.
  recordingPath(): string | undefined {
    return this.path;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.unsubscribe();
    this.stream?.end();
    this.stream = undefined;
  }

  // The colors the client reported for this PTY's terminal. A surface that mounts before the session
  // produces its first output has had time to report, and one that has not leaves the header without
  // a theme, which is the same state as a recording made by another tool.
  setColors(colors: TerminalColors): void {
    this.colors = colors;
  }

  private onData(data: string): void {
    if (this.disposed || this.failed) return;
    if (!this.stream) this.open();
    this.writeEvent('o', data);
  }

  // Track the latest dimensions always; emit an `"r"` event only once the file is open. A resize
  // arriving before the first output just updates the pending header dimensions.
  private onResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.disposed || this.failed || !this.stream) return;
    this.writeEvent('r', `${cols}x${rows}`);
  }

  // v3's exit event, written as the last line of the recording so a player can say how the session
  // ended. A session ended by its tab closing or by the application shutting down never reports an
  // exit — the process may still be running on the other end of a remote harness — and none is
  // invented for it.
  private onExit(exitCode: number): void {
    this.writeEvent('x', String(exitCode));
    this.dispose();
  }

  // Lazily open the append stream and write the asciicast header line. A synchronous throw here
  // (an `EACCES` on the project directory, say) would otherwise be swallowed by the bus's
  // per-listener try/catch, leaving the recorder to retry the open on every subsequent chunk for the
  // life of the session while never writing anything — so it disables the recorder instead.
  private open(): void {
    try {
      ensureRecordingDirectory();
      this.path = harnessRecordingPath(this.label, this.startedAt);
      const stream = createWriteStream(this.path, { flags: 'a' });
      // A Node stream's async `'error'` event escapes the bus's per-listener try/catch and would
      // crash the process if unhandled — disable the recorder instead.
      stream.on('error', () => { this.abandon(); });
      this.stream = stream;
      stream.write(JSON.stringify(this.header()) + '\n');
    } catch {
      this.path = undefined;
      this.abandon();
    }
  }

  private header(): Record<string, unknown> {
    return castHeader({
      cols: this.cols,
      rows: this.rows,
      timestamp: this.startedAt,
      idleTimeLimit: IDLE_TIME_LIMIT,
      command: this.command,
      title: this.label,
      colors: this.colors,
    });
  }

  // Stop recording for good, reporting it once. Both failure paths land here, so a caller hears
  // about a write error and an open error alike, and hears about it once.
  private abandon(): void {
    if (this.failed) return;
    this.failed = true;
    this.onFailure();
  }

  private writeEvent(code: 'o' | 'r' | 'x', data: string): void {
    if (this.failed || !this.stream) return;
    const elapsed = (Date.now() - this.startedAt) / 1000;
    this.stream.write(JSON.stringify([this.clock.interval(elapsed), code, data]) + '\n');
  }
}
