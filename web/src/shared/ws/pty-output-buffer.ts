// The early-output retention policy for PTY streams a renderer has not attached to yet. Every
// string the client receives for an unclaimed stream used to accumulate without limit; this module
// bounds it — per stream, in aggregate, and in time for streams that exited before anyone mounted.

const DEFAULT_MAX_STREAM_BYTES = 512 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXITED_TTL_MS = 30_000;

export type PtyOutputBufferOptions = {
  // Retained ceiling for one stream. Oldest whole chunks are dropped past it.
  maxStreamBytes?: number;
  // Retained ceiling across all streams. Oldest unclaimed streams are evicted whole past it.
  maxTotalBytes?: number;
  // How long an exited stream nobody claimed keeps its output before it is dropped. A grace
  // period rather than an immediate delete, because a terminal card can mount for a stream that
  // has already exited.
  exitedTtlMs?: number;
};

type Stream = {
  chunks: string[];
  bytes: number;
  exited: boolean;
  truncated: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

// Preceded by an SGR reset because chunks are dropped whole and a chunk boundary can split a
// multi-byte escape sequence: a dangling partial sequence consumes at most the marker's own prefix
// bytes, and the next complete sequence restores rendering. Held as a flag rather than a chunk so
// later trims cannot drop it, and so it is not charged against the data limit.
const TRUNCATION_MARKER = '\r\n\u{1B}[0m[earlier output trimmed]\r\n';

export class PtyOutputBuffer {
  private streams = new Map<string, Stream>();
  private readonly maxStreamBytes: number;
  private readonly maxTotalBytes: number;
  private readonly exitedTtlMs: number;

  constructor(options: PtyOutputBufferOptions = {}) {
    this.maxStreamBytes = options.maxStreamBytes ?? DEFAULT_MAX_STREAM_BYTES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.exitedTtlMs = options.exitedTtlMs ?? DEFAULT_EXITED_TTL_MS;
  }

  // Retain output for a stream with no attached handler.
  record(id: string, data: string): void {
    const stream = this.streams.get(id) ?? this.create(id);
    stream.chunks.push(data);
    stream.bytes += data.length;
    this.trimToStreamLimit(stream);
    this.enforceAggregateLimit();
  }

  // Mark a stream exited. While it still has no attached handler, its output now lives only for
  // the grace period.
  markExited(id: string): void {
    const stream = this.streams.get(id);
    if (!stream || stream.exited) return;
    stream.exited = true;
    stream.timer = setTimeout(() => { this.drop(id); }, this.exitedTtlMs);
  }

  // Replay retained output to the attaching handler in arrival order and claim the stream: live
  // delivery takes over and nothing is buffered for this id again unless the handler detaches.
  drain(id: string, onData: (data: string) => void): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    if (stream.timer) clearTimeout(stream.timer);
    this.streams.delete(id);
    if (stream.truncated) onData(TRUNCATION_MARKER);
    for (const chunk of stream.chunks) onData(chunk);
  }

  // Release everything: retained data and any pending expiration timer.
  dispose(): void {
    for (const stream of this.streams.values()) {
      if (stream.timer) clearTimeout(stream.timer);
    }
    this.streams.clear();
  }

  private create(id: string): Stream {
    const stream: Stream = { chunks: [], bytes: 0, exited: false, truncated: false };
    this.streams.set(id, stream);
    return stream;
  }

  private drop(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    if (stream.timer) clearTimeout(stream.timer);
    this.streams.delete(id);
  }

  private trimToStreamLimit(stream: Stream): void {
    if (stream.bytes <= this.maxStreamBytes) return;
    // Drop oldest whole chunks until the retained output fits, or until only the newest chunk
    // remains — an individual chunk larger than the whole limit is dropped to the marker alone
    // rather than retained.
    while (stream.bytes > this.maxStreamBytes && stream.chunks.length > 1) {
      stream.bytes -= stream.chunks.shift()!.length;
      stream.truncated = true;
    }
    if (stream.bytes > this.maxStreamBytes) {
      stream.chunks = [];
      stream.bytes = 0;
      stream.truncated = true;
    }
  }

  private enforceAggregateLimit(): void {
    let total = 0;
    for (const stream of this.streams.values()) total += stream.bytes;
    // Map iteration is insertion order, so the first entries are the streams that started
    // buffering earliest — evict those whole. Every stream here is unclaimed by definition.
    for (const [id, stream] of this.streams) {
      if (total <= this.maxTotalBytes) return;
      total -= stream.bytes;
      this.drop(id);
    }
  }
}
