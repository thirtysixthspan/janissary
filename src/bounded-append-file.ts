import { createWriteStream, type WriteStream } from 'node:fs';

export const MAX_PENDING_APPEND_BYTES = 4 * 1024 * 1024;

// A lazily opened, append-only file written through a single long-lived stream (not per-line
// `appendFileSync`), so a burst of writes never blocks the caller. The file is opened on the first
// `write`, never at construction, and `resolvePath` — called once, at that moment — is responsible
// for ensuring its directory exists.
//
// Writes are bounded: a line that would push the stream's unflushed bytes past `maxPendingBytes` is
// refused, and the file is abandoned rather than letting a stalled disk grow memory without limit.
// Open errors, stream errors, and excessive pending output all abandon the file, release its stream,
// and fire `onFailure` exactly once; every later `write` is a no-op. `onFailure` is required rather
// than optional so that a caller cannot leave an abandoned file unreported by simply not passing it.
export class BoundedAppendFile {
  private stream: WriteStream | undefined;
  private path: string | undefined;
  private failed = false;
  private disposed = false;

  constructor(
    private readonly resolvePath: () => string,
    private readonly maxPendingBytes: number,
    private readonly onFailure: () => void,
  ) {}

  write(line: string): void {
    if (this.failed || this.disposed) return;
    if (!this.stream) this.open();
    if (!this.stream) return;
    if (this.stream.writableLength + Buffer.byteLength(line) > this.maxPendingBytes) {
      this.abandon();
      return;
    }
    this.stream.write(line);
  }

  isOpen(): boolean {
    return this.stream !== undefined;
  }

  // The file's path once a stream has been created for it. Kept after an abandon or dispose, since
  // the file outlives the stream; cleared only when the open itself threw, as nothing was created.
  openedPath(): string | undefined {
    return this.path;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stream?.end();
    this.stream = undefined;
  }

  // A synchronous throw here (an `EACCES` on the target directory, say) inside a bus listener would
  // otherwise be swallowed by the bus's per-listener try/catch, leaving the caller to retry the open
  // on every subsequent write while never writing anything — so it abandons the file instead.
  private open(): void {
    try {
      this.path = this.resolvePath();
      const stream = createWriteStream(this.path, { flags: 'a' });
      // A Node stream's async `'error'` event escapes any caller's try/catch and would crash the
      // process if unhandled — abandon the file instead.
      stream.on('error', () => { this.abandon(); });
      this.stream = stream;
    } catch {
      this.path = undefined;
      this.abandon();
    }
  }

  private abandon(): void {
    if (this.failed) return;
    this.failed = true;
    this.stream?.destroy();
    this.stream = undefined;
    this.onFailure();
  }
}
