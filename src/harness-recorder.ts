import { createWriteStream, type WriteStream } from 'node:fs';
import { messageBus, type Subscription } from './bus.js';
import { ensureRecordingDirectory, harnessRecordingPath } from './harness-recording-file.js';

// The terminal name the PTY is actually spawned with (`src/pty.ts`); asciicast players read it for
// correct rendering.
const TERM = 'xterm-256color';

// Records one harness PTY's byte stream to a replayable asciicast v2 `.cast` file. It observes the
// same `pty` bus events as `HarnessScreenReader` (its sibling observer of the same bytes) and, like
// it, is owned/disposed by `HarnessManager`. The file is created lazily on the first `data` event —
// a harness that exits before producing output leaves no empty file. Uses a single long-lived
// append stream (not per-event `appendFileSync`) so a burst of PTY output never blocks `bus.emit`.
export class HarnessRecorder {
  private subscription: Subscription;
  private stream: WriteStream | undefined;
  private readonly startedAt = Date.now();
  private disposed = false;
  private failed = false;

  constructor(
    private id: string,
    private label: string,
    private program: string,
    private cols: number,
    private rows: number,
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

  // Lazily open the append stream and write the asciicast v2 header line.
  private open(): void {
    ensureRecordingDirectory();
    const stream = createWriteStream(harnessRecordingPath(this.label, this.startedAt), { flags: 'a' });
    // A Node stream's async `'error'` event escapes the bus's per-listener try/catch and would
    // crash the process if unhandled — disable the recorder instead.
    stream.on('error', () => { this.failed = true; });
    this.stream = stream;
    const header = {
      version: 2,
      width: this.cols,
      height: this.rows,
      timestamp: Math.floor(this.startedAt / 1000),
      command: this.program,
      title: this.label,
      env: { TERM },
    };
    stream.write(JSON.stringify(header) + '\n');
  }

  private writeEvent(code: 'o' | 'r', data: string): void {
    if (this.failed || !this.stream) return;
    const elapsed = Math.round(((Date.now() - this.startedAt) / 1000) * 1e6) / 1e6;
    this.stream.write(JSON.stringify([elapsed, code, data]) + '\n');
  }
}
