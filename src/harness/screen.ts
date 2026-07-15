import xterm, { type Terminal } from '@xterm/headless';
import { messageBus, type Subscription } from '../bus.js';

// `@xterm/headless` ships a CommonJS bundle whose named exports Node's ESM loader cannot detect
// statically — the module namespace it synthesizes holds only `default`. So `import { Terminal }`
// type-checks but throws SyntaxError under Node, while `import Terminal` binds the whole
// `module.exports` object (not the class) and fails as "default is not a constructor". Take the
// class off the default import, which Node sets to `module.exports`, and keep the named import
// type-only so it erases at compile time.
const { Terminal: HeadlessTerminal } = xterm;

export type ScreenCapture = { text: string; capturedAt: number; title?: string };

// Delay between a PTY byte arriving and the screen being read: long enough for a burst of output
// to settle into a coherent frame, short enough that the capture reflects "now".
const CAPTURE_DELAY_MS = 1000;

// Mirrors one harness PTY into a headless terminal so its on-screen text can be read server-side.
// Captures are throttled on activity: the first `data` event schedules a read 1s later, further
// events in that window neither reschedule nor extend it, and an idle PTY schedules nothing at
// all — so an unchanged screen is never re-captured. Only the latest capture is kept.
export class HarnessScreenReader {
  private term: Terminal;
  private subscription: Subscription;
  private pending: ReturnType<typeof setTimeout> | undefined;
  private capture: ScreenCapture | undefined;
  private title: string | undefined;
  private disposed = false;

  constructor(private id: string, cols: number, rows: number, private onCapture?: (capture: ScreenCapture) => void) {
    // allowProposedApi: the headless build gates the `buffer` read API behind it.
    this.term = new HeadlessTerminal({ cols, rows, scrollback: 0, allowProposedApi: true });
    // The terminal parses OSC 0/2 title sequences itself; retain the latest so each capture can
    // carry the title alongside the rendered text (harness busy/ready detection reads it).
    this.term.onTitleChange((title) => { this.title = title; });
    this.subscription = messageBus.on('pty', ['data', 'exit', 'resize'], (event) => {
      if (event.id !== this.id) return;
      if (event.type === 'data') this.onData(event.data);
      else if (event.type === 'resize') this.term.resize(event.cols, event.rows);
      else this.dispose();
    });
  }

  // The most recent capture, or undefined if the PTY has never been quiet 1s after output.
  latestCapture(): ScreenCapture | undefined { return this.capture; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pending !== undefined) clearTimeout(this.pending);
    this.pending = undefined;
    this.subscription.unsubscribe();
    this.term.dispose();
  }

  private onData(data: string): void {
    this.term.write(data);
    if (this.pending !== undefined) return;
    this.pending = setTimeout(() => {
      this.pending = undefined;
      // xterm parses write() input asynchronously; read the buffer only after the queue drains.
      this.term.write('', () => { if (!this.disposed) this.captureNow(); });
    }, CAPTURE_DELAY_MS);
  }

  private captureNow(): void {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
    }
    while (lines.length > 0 && lines.at(-1) === '') lines.pop();
    this.capture = { text: lines.join('\n'), capturedAt: Date.now(), title: this.title };
    this.onCapture?.(this.capture);
  }
}
