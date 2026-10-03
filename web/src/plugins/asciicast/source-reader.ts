import { CastStream, type CastEvent, type CastHeader } from './cast-stream';

export const POLL_MS = 750;

export type AsciicastSource = {
  header: CastHeader | undefined;
  events: readonly CastEvent[];
  error: string | undefined;
  exitStatus?: number;
  live: boolean;
};

export const EMPTY_SOURCE: AsciicastSource = {
  header: undefined, events: [], error: undefined, exitStatus: undefined, live: false,
};

// Each instance is one source generation. Disposed instances can never publish a late body or
// liveness answer, even when the transport does not honor the abort signal.
export class AsciicastReader {
  private stream = new CastStream();
  // Streaming decoding retains an incomplete UTF-8 sequence until the next byte range arrives.
  private decoder = new TextDecoder();
  private abort = new AbortController();
  private offset = 0;
  private disposed = false;
  private pending = false;
  private ready = false;
  private active = false;
  private failure: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private url: string,
    private live: boolean,
    private askLive: () => Promise<boolean>,
    private listener: (source: AsciicastSource) => void,
  ) {}

  start(active: boolean): void {
    this.active = active;
    this.publish();
    void this.load(true);
  }

  setActive(active: boolean): void {
    this.active = active;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.schedule();
  }

  setLive(live: boolean): void {
    this.live &&= live;
    this.publish();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.abort.abort();
  }

  private publish(): void {
    if (this.disposed) return;
    this.listener({
      header: this.stream.header,
      events: this.stream.events,
      error: this.failure ?? this.stream.error,
      exitStatus: this.stream.exitStatus,
      live: this.live && this.stream.exitStatus === undefined,
    });
  }

  private schedule(): void {
    if (this.disposed || !this.active || !this.ready || this.pending || this.failure || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.load(false);
    }, POLL_MS);
  }

  private async read(): Promise<boolean> {
    const from = this.offset;
    const response = await fetch(this.url, {
      cache: 'no-store', signal: this.abort.signal,
      ...(from > 0 && { headers: { Range: `bytes=${from}-` } }),
    });
    if (this.disposed || response.status === 416) return false;
    const body = await response.arrayBuffer();
    if (this.disposed || body.byteLength === 0) return false;
    this.offset = from + body.byteLength;
    this.stream.push(this.decoder.decode(body, { stream: true }));
    return true;
  }

  private async refreshLive(): Promise<void> {
    try {
      const live = await this.askLive();
      if (!this.disposed) this.live &&= live;
    } catch {
      // An unanswered host request is not evidence that a quiet recording has ended.
    }
  }

  private async load(initial: boolean): Promise<void> {
    this.pending = true;
    try {
      const grew = await this.read();
      if (this.disposed) return;
      if (!initial && !grew && this.live && this.stream.exitStatus === undefined) await this.refreshLive();
      this.publish();
    } catch {
      if (this.disposed) return;
      this.failure = 'the recording could not be read';
      this.publish();
    } finally {
      this.pending = false;
      this.ready = true;
      this.schedule();
    }
  }
}
