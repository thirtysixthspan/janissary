// Lines the command bar submits while zsh is busy. They wait in the tab's own command queue on the
// server — the one the queue popup lists and edits — and run one at a time once zsh is back at its
// prompt. Framework-free: the hook that owns an instance feeds it zsh's command markers.

export type ShellQueueTransport = {
  enqueue(line: string): Promise<void>;
  dequeue(): Promise<string | null>;
};

// Runs one line and answers whether it was written to zsh. A line zsh received has to finish before
// the next queued one runs, so the drain stops there and resumes at zsh's next prompt. `queued` is
// true for a line taken from the queue, which was recorded in the bar's history when it was queued.
export type ShellLineRunner = (line: string, queued: boolean) => Promise<boolean>;

export class ShellCommandQueue {
  private busy: boolean;
  private draining = false;
  private disposed = false;

  constructor(
    private readonly transport: ShellQueueTransport,
    private readonly run: ShellLineRunner,
    initiallyBusy = false,
  ) {
    this.busy = initiallyBusy;
  }

  // Fed by zsh's own markers: true when a command starts, false when zsh returns to its prompt.
  setBusy(running: boolean): void {
    this.busy = running;
    if (!running) void this.drain();
  }

  // A line queued by another tab changes the shared queue without going through submit. Wake an
  // idle shell so that line receives the same command-bar routing as one queued locally.
  wake(): void {
    if (!this.busy) void this.drain();
  }

  // Queues the line and answers true while zsh is busy or the queue is draining, so a new line never
  // overtakes one already waiting. Otherwise runs it now and answers false. That run counts as a drain
  // until it settles, because zsh's command markers arrive only after the line has been written: a
  // second line submitted before then must wait behind the first rather than reach zsh's input.
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
        // Busy until zsh's next prompt says otherwise: the command markers arrive after the line is
        // written, and the next entry must not slip in ahead of them.
        if (await this.run(line, true)) this.busy = true;
      }
    } finally {
      this.draining = false;
    }
  }
}
