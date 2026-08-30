import { createWriteStream, type WriteStream } from 'node:fs';
import { messageBus, type Subscription } from '../bus.js';
import { ensureRecordingDirectory, harnessRecordingPath } from './recording-file.js';

// The terminal name the PTY is actually spawned with (`src/pty.ts`); asciicast players read it for
// correct rendering.
const TERM = 'xterm-256color';

// Records one harness PTY's byte stream to a replayable asciicast v2 `.cast` file. It observes the
// same `pty` bus events as `HarnessScreenReader` (its sibling observer of the same bytes) and, like
// it, is owned/disposed by `HarnessManager`. The file is created lazily on the first `data` event —
// a harness that exits before producing output leaves no empty file. Uses a single long-lived
// append stream (not per-event `appendFileSync`) so a burst of PTY output never blocks `bus.emit`.
//
// `command` is what the asciicast header reports the session ran: a bare program name (`claude`)
// for a named harness, the whole verbatim `ssh …` invocation for an ssh tab. `onFailure` fires at
// most once if recording is abandoned, and is required rather than optional so that a new spawn
// path cannot leave an abandoned recording unreported by simply not passing it.
export class HarnessRecorder {
  private subscription: Subscription;
  private stream: WriteStream | undefined;
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
      else this.dispose();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.unsubscribe();
    this.stream?.end();
    this.stream = undefined;
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

  // Lazily open the append stream and write the asciicast v2 header line. A synchronous throw here
  // (an `EACCES` on the project directory, say) would otherwise be swallowed by the bus's
  // per-listener try/catch, leaving the recorder to retry the open on every subsequent chunk for the
  // life of the session while never writing anything — so it disables the recorder instead.
  private open(): void {
    try {
      ensureRecordingDirectory();
      const stream = createWriteStream(harnessRecordingPath(this.label, this.startedAt), { flags: 'a' });
      // A Node stream's async `'error'` event escapes the bus's per-listener try/catch and would
      // crash the process if unhandled — disable the recorder instead.
      stream.on('error', () => { this.abandon(); });
      this.stream = stream;
      stream.write(JSON.stringify(this.header()) + '\n');
    } catch {
      this.abandon();
    }
  }

  private header(): Record<string, unknown> {
    return {
      version: 2,
      width: this.cols,
      height: this.rows,
      timestamp: Math.floor(this.startedAt / 1000),
      command: this.command,
      title: this.label,
      env: { TERM },
    };
  }

  // Stop recording for good, reporting it once. Both failure paths land here, so a caller hears
  // about a write error and an open error alike, and hears about it once.
  private abandon(): void {
    if (this.failed) return;
    this.failed = true;
    this.onFailure();
  }

  private writeEvent(code: 'o' | 'r', data: string): void {
    if (this.failed || !this.stream) return;
    const elapsed = Math.round(((Date.now() - this.startedAt) / 1000) * 1e6) / 1e6;
    this.stream.write(JSON.stringify([elapsed, code, data]) + '\n');
  }
}
