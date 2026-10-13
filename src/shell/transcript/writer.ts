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

// Characters handed to xterm and not yet parsed. A shell can print faster than the headless terminal
// parses, and xterm 6 throws "write data discarded" from every `write` once its backlog passes
// 50,000,000 characters; this cap stops the transcript long before that and bounds the memory held.
export const MAX_UNPARSED_CHARS = 4 * 1024 * 1024;

// Mirrors one shell PTY's byte stream into a headless terminal and writes the rows it displayed on
// its normal screen to a plain-text file, one file line per screen row (see `TranscriptRowTracker`).
// The file is created lazily on the first output, and `onOpened` announces its path once. Any write
// failure, or output arriving faster than `maxUnparsedChars` lets it be parsed, stops the transcript
// and fires `onFailure` once; the shell itself is never affected.
//
// Exit, `dispose()` and failure share one finishing path: it waits for xterm's asynchronous parse to
// drain, writes the cursor's unfinished row (not after a failure, when that row may be cut short),
// then closes the file. `dispose()` returns that path's promise, which settles once the final row has
// reached the file and the file has closed; it never rejects.
export class ShellTranscriptWriter {
  private readonly term: Terminal;
  private readonly file: BoundedAppendFile;
  private readonly tracker: TranscriptRowTracker;
  private readonly subscription: Subscription;
  private readonly startedAt = Date.now();
  private finished = false;
  private finishing: Promise<void> = Promise.resolve();
  private failed = false;
  private unparsed = 0;

  constructor(
    private readonly ptyId: string,
    private readonly label: string,
    cols: number,
    rows: number,
    private readonly onFailure: () => void,
    private readonly onOpened: (path: string) => void,
    private readonly maxUnparsedChars = MAX_UNPARSED_CHARS,
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

  dispose(): Promise<void> {
    this.finish();
    return this.finishing;
  }

  // The transcript's path while its file is open for appending: undefined before the first output,
  // after a failure abandoned the file, and once the finishing path has closed it.
  writingPath(): string | undefined {
    return this.file.isOpen() ? this.file.openedPath() : undefined;
  }

  // Opening the file on the first output, before any row is finished, is what lets the transcript
  // be named as soon as the shell starts: a first prompt has no line feed to flush it.
  private onData(data: string): void {
    if (data === '') return;
    if (!this.file.isOpen()) this.open();
    if (this.finished) return;
    if (this.unparsed + data.length > this.maxUnparsedChars) {
      this.fail();
      return;
    }
    this.unparsed += data.length;
    if (!this.queue(data, () => { this.unparsed -= data.length; })) this.fail();
  }

  // xterm parses `write` input asynchronously but resizes at once, so the resize is queued behind the
  // output already received: rows that arrived before it still wrap at the old width.
  private onResize(cols: number, rows: number): void {
    if (!this.queue('', () => { this.term.resize(cols, rows); })) this.fail();
  }

  // Returns false when xterm refuses the write because its unparsed backlog is over its watermark.
  private queue(data: string, parsed: () => void): boolean {
    try {
      this.term.write(data, parsed);
      return true;
    } catch {
      return false;
    }
  }

  // An empty write creates the file without adding content.
  private open(): void {
    this.file.write('');
    const path = this.file.openedPath();
    if (path !== undefined) this.onOpened(path);
  }

  // Fires `onFailure` once across both sources: the unparsed-output cap and the file's own failures.
  // The file's pending-byte limit can trip inside a line-feed handler during xterm's parse, so this
  // leaves disposing the terminal to the finishing path's drained callback. Chunks already accepted
  // are still parsed, so their finished rows reach the file while it remains writable.
  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.finish();
    this.onFailure();
  }

  // When xterm refuses even the empty drain write, its buffer holds unparsed output and is not safe
  // to read, so the file and terminal are closed at once without the final flush.
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.subscription.unsubscribe();
    this.finishing = new Promise((resolve) => {
      const close = (flush: boolean): void => { void this.close(flush).then(resolve); };
      if (!this.queue('', () => { close(!this.failed); })) close(false);
    });
  }

  private close(flush: boolean): Promise<void> {
    if (flush) this.tracker.finish();
    const closed = this.file.dispose();
    this.term.dispose();
    return closed;
  }
}
