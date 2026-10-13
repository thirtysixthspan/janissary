import { BoundedAppendFile, MAX_PENDING_APPEND_BYTES } from '../bounded-append-file.js';
import { messageBus, type Subscription } from '../bus.js';
import { ensureRecordingDirectory, harnessRecordingPath } from './recording-file.js';
import { IntervalClock } from './cast-interval-clock.js';
import { castHeader } from './cast-header.js';
import type { TerminalColors } from './terminal-colors.js';

// Records one harness PTY's byte stream to a replayable asciicast v3 `.cast` file. It observes the
// same `pty` bus events as `HarnessScreenReader` (its sibling observer of the same bytes) and, like
// it, is owned/disposed by `HarnessManager`. The file is created lazily on the first `data` event —
// a harness that exits before producing output leaves no empty file. The writing itself, including
// its pending-byte limit and its handling of open and stream errors, is `BoundedAppendFile`'s.
//
// `command` is what the asciicast header reports the session ran: a bare program name (`claude`) for a
// named harness, the whole verbatim `ssh …` invocation for an ssh tab, the shell's own path for a
// shell tab. `onFailure` fires at most once if recording is abandoned, and is required rather than
// optional so that a new spawn path cannot leave an abandoned recording unreported by simply not
// passing it.
//
// `onOpened` fires once, when the file is actually opened, carrying its path — which is the first
// moment there is a recording to name. The tab remembers it from here because the recorder is
// released when the PTY exits while the tab, and the file, both outlive the process.
export class HarnessRecorder {
  private subscription: Subscription;
  private readonly file: BoundedAppendFile;
  private readonly clock = new IntervalClock();
  private colors: TerminalColors | undefined;
  private readonly startedAt = Date.now();
  private disposed = false;

  constructor(
    private id: string,
    private label: string,
    private command: string,
    private cols: number,
    private rows: number,
    private onFailure: () => void,
    private onOpened?: (path: string) => void,
  ) {
    this.file = new BoundedAppendFile(
      () => {
        ensureRecordingDirectory();
        return harnessRecordingPath(this.label, this.startedAt);
      },
      MAX_PENDING_APPEND_BYTES,
      () => { this.abandon(); },
    );
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
    return this.file.openedPath();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.unsubscribe();
    this.file.dispose();
  }

  // The colors the client reported for this PTY's terminal. A surface that mounts before the session
  // produces its first output has had time to report, and one that has not leaves the header without
  // a theme, which is the same state as a recording made by another tool.
  setColors(colors: TerminalColors): void {
    this.colors = colors;
  }

  private onData(data: string): void {
    if (this.disposed) return;
    if (!this.file.isOpen()) this.open();
    this.writeEvent('o', data);
  }

  // Track the latest dimensions always; emit an `"r"` event only once the file is open. A resize
  // arriving before the first output just updates the pending header dimensions.
  private onResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
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

  // Writing the asciicast header line is what lazily opens the file. The path is announced only
  // after it, so a listener that opens the file to read it finds a complete header rather than an
  // empty file with a header still to come.
  private open(): void {
    this.file.write(JSON.stringify(this.header()) + '\n');
    const path = this.file.openedPath();
    if (path !== undefined) this.onOpened?.(path);
  }

  private header(): Record<string, unknown> {
    return castHeader({
      cols: this.cols,
      rows: this.rows,
      timestamp: this.startedAt,
      command: this.command,
      title: this.label,
      colors: this.colors,
    });
  }

  // Open errors, stream errors, and excessive pending output all stop recording — `BoundedAppendFile`
  // has already released the stream — and report once, so none can interrupt the PTY's own lifecycle.
  private abandon(): void {
    this.disposed = true;
    this.subscription.unsubscribe();
    this.onFailure();
  }

  // Never reaches `file.write` before the header has opened the file: `write` opens lazily, so a
  // resize or exit arriving before the first output would otherwise create a file with no header.
  private writeEvent(code: 'o' | 'r' | 'x', data: string): void {
    if (!this.file.isOpen()) return;
    const elapsed = (Date.now() - this.startedAt) / 1000;
    this.file.write(JSON.stringify([this.clock.interval(elapsed), code, data]) + '\n');
  }
}
