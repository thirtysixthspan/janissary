import xterm, { type Terminal } from '@xterm/headless';
import { BoundedAppendFile, MAX_PENDING_APPEND_BYTES } from '../../bounded-append-file.js';
import { messageBus, type Subscription } from '../../bus.js';
import { ensureShellTranscriptDirectory, shellTranscriptPath } from './transcript-file.js';
import { TranscriptRowTracker } from './row-tracker.js';

// `@xterm/headless` is a CommonJS bundle whose named exports Node's ESM loader cannot see; take the
// class off the default import and keep the named import type-only (see `src/harness/screen.ts`).
const { Terminal: HeadlessTerminal } = xterm;

// Only the rows between two line feeds must survive in the scrollback for the row tracker to read
// them, so 1000 rows is ample. The accepted loss: a single unbroken line longer than 1000 × columns
// has its marker trimmed away, and of that line only the row it ends on is written.
const SCROLLBACK_ROWS = 1000;

// Mirrors one shell PTY's byte stream into a headless terminal and writes the rows it displayed on
// its normal screen to a plain-text file, one file line per screen row (see `TranscriptRowTracker`).
// The file is created lazily on the first output, and `onOpened` announces its path once. Any write
// failure stops the transcript and fires `onFailure` once; the shell itself is never affected.
//
// Exit, `dispose()` and failure share one finishing path: it waits for xterm's asynchronous parse to
// drain, writes the cursor's unfinished row, then closes the file. `dispose()` therefore returns
// before that final row reaches the stream.
export class ShellTranscriptWriter {
  private readonly term: Terminal;
  private readonly file: BoundedAppendFile;
  private readonly tracker: TranscriptRowTracker;
  private readonly subscription: Subscription;
  private readonly startedAt = Date.now();
  private finished = false;

  constructor(
    private readonly ptyId: string,
    private readonly label: string,
    cols: number,
    rows: number,
    private readonly onFailure: () => void,
    private readonly onOpened: (path: string) => void,
  ) {
    // allowProposedApi: the headless build gates markers, buffer reads and the parser behind it.
    this.term = new HeadlessTerminal({ cols, rows, scrollback: SCROLLBACK_ROWS, allowProposedApi: true });
    this.file = new BoundedAppendFile(
      () => {
        ensureShellTranscriptDirectory();
        return shellTranscriptPath(this.label, this.startedAt);
      },
      MAX_PENDING_APPEND_BYTES,
      () => { this.fail(); },
    );
    // Rows reach the file only once output has opened it, so a writer finished before any output
    // (its final flush is a blank cursor row) leaves no file behind.
    this.tracker = new TranscriptRowTracker(this.term, (text) => {
      if (this.file.isOpen()) this.file.write(text);
    });
    this.subscription = messageBus.on('pty', ['data', 'exit', 'resize'], (event) => {
      if (event.id !== this.ptyId) return;
      if (event.type === 'data') this.onData(event.data);
      else if (event.type === 'resize') this.onResize(event.cols, event.rows);
      else this.finish();
    });
  }

  dispose(): void {
    this.finish();
  }

  // Opening the file on the first output, before any row is finished, is what lets the transcript
  // be named as soon as the shell starts: a first prompt has no line feed to flush it.
  private onData(data: string): void {
    if (data === '') return;
    if (!this.file.isOpen()) this.open();
    if (this.finished) return;
    this.term.write(data);
  }

  // xterm parses `write` input asynchronously but resizes at once, so the resize is queued behind the
  // output already received: rows that arrived before it still wrap at the old width.
  private onResize(cols: number, rows: number): void {
    this.term.write('', () => { this.term.resize(cols, rows); });
  }

  // An empty write creates the file without adding content.
  private open(): void {
    this.file.write('');
    const path = this.file.openedPath();
    if (path !== undefined) this.onOpened(path);
  }

  // Can run inside a line-feed handler during xterm's parse (the pending-byte limit), so it leaves
  // disposing the terminal to the finishing path's drained callback.
  private fail(): void {
    this.finish();
    this.onFailure();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.subscription.unsubscribe();
    this.term.write('', () => {
      this.tracker.finish();
      this.file.dispose();
      this.term.dispose();
    });
  }
}
