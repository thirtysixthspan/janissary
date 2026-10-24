// The bookkeeping every request the channel sends and waits on shares: a promise per request id,
// an optional deadline, and settlement exactly once — by its reply, by a refusal, by the deadline,
// or by the channel going away. Kept as one tested primitive so a new request family gets all four
// by using it rather than by remembering to write each one again.

export type Settlement<T> = { value: T } | { reason: Error };

type Entry<T> = {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

export class PendingRequests<T> {
  private entries = new Map<string, Entry<T>>();

  // Register a request under `id` and answer the promise its settlement resolves. A deadline's timer
  // is unref'd, so a request still waiting never holds the process open on its own.
  open(id: string, options: { deadlineMs?: number; onTimeout?: (id: string) => void } = {}): Promise<T> {
    let resolve = (_value: T) => {};
    let reject = (_reason: Error) => {};
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
    const promise = new Promise<T>((done, refuse) => { resolve = done; reject = refuse; });
    const entry: Entry<T> = { resolve, reject };
    if (options.deadlineMs !== undefined) {
      entry.timer = setTimeout(() => options.onTimeout?.(id), options.deadlineMs);
      entry.timer.unref?.();
    }
    this.entries.set(id, entry);
    return promise;
  }

  // Resolve one request. False when it was already settled or never opened, so a late reply is a
  // no-op rather than a second answer.
  settle(id: string, value: T): boolean {
    const entry = this.take(id);
    entry?.resolve(value);
    return entry !== undefined;
  }

  // Reject one request, with the same once-only rule as `settle`.
  fail(id: string, reason: Error): boolean {
    const entry = this.take(id);
    entry?.reject(reason);
    return entry !== undefined;
  }

  // Settle every request still waiting — the channel closed or detached — each with its own outcome.
  settleAll(outcome: (id: string) => Settlement<T>): void {
    for (const id of this.entries.keys()) {
      const settlement = outcome(id);
      if ('reason' in settlement) this.fail(id, settlement.reason);
      else this.settle(id, settlement.value);
    }
  }

  private take(id: string): Entry<T> | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    this.entries.delete(id);
    return entry;
  }
}
