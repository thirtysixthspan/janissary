// Core FIFO execution against server-owned storage. Consumers supply routing and busy/idle signals.

export type QueueTransport = {
  enqueue(line: string): Promise<void>;
  dequeue(): Promise<string | null>;
};

// True pauses draining until the consumer reports idle. False continues to the next queued line.
// `queued` distinguishes stored lines from a new submission, for consumers tracking input history.
export type QueuedLineRunner = (line: string, queued: boolean) => Promise<boolean>;

export class CommandQueue {
  private busy: boolean;
  private draining = false;
  private disposed = false;

  constructor(
    private readonly transport: QueueTransport,
    private readonly run: QueuedLineRunner,
    initiallyBusy = false,
  ) {
    this.busy = initiallyBusy;
  }

  // The consumer reports completion; core never needs to know how that consumer executes work.
  setBusy(running: boolean): void {
    this.busy = running;
    if (!running) void this.drain();
  }

  // A line queued by another tab changes the shared queue without going through submit. Wake an
  // idle consumer so the line receives the same routing as one queued locally.
  wake(): void {
    if (!this.busy) void this.drain();
  }

  // Queues the line and answers true while the consumer is busy or the queue is draining, so a new line never
  // overtakes one already waiting. Otherwise runs it now and answers false. That run counts as a drain
  // until it settles, because the consumer's busy signals arrive only after the line has been written: a
  // second line submitted before then must wait behind the first rather than reach the consumer's input.
  submit(line: string): boolean {
    if (this.busy || this.draining) {
      void this.transport.enqueue(line);
      return true;
    }
    void this.drain(line);
    return false;
  }

  // Stops a drain from asking a closed tab for its next line. Paired with `attach` so a remount —
  // which React's development mode does once on purpose — leaves the instance working.
  attach(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
  }

  private async drain(submitted?: string): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      if (submitted !== undefined && await this.run(submitted, false)) this.busy = true;
      while (!this.busy && !this.disposed) {
        const line = await this.transport.dequeue();
        if (line === null || this.disposed) return;
        // Hold the next line until completion, even when the busy signal arrives asynchronously.
        if (await this.run(line, true)) this.busy = true;
      }
    } finally {
      this.draining = false;
    }
  }
}
