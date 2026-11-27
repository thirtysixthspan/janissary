// A spawn that waits on its MCP endpoint's bind has no process yet, but frames for its id keep
// arriving in the meantime. Each one is held here: a kill cancels the spawn so no process starts
// with nothing attached to it, and input and the latest size are handed back to be applied once the
// process exists.
export type HeldFrames = { input: string[]; size?: { cols: number; rows: number } };

type Pending = HeldFrames & { cancelled: boolean };

export class PendingSpawns {
  private readonly pending = new Map<string, Pending>();

  has(id: string): boolean { return this.pending.has(id); }

  begin(id: string): void { this.pending.set(id, { cancelled: false, input: [] }); }

  input(id: string, data: string): boolean {
    const pending = this.pending.get(id);
    pending?.input.push(data);
    return pending !== undefined;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const pending = this.pending.get(id);
    if (pending !== undefined) pending.size = { cols, rows };
    return pending !== undefined;
  }

  cancel(id: string): boolean {
    const pending = this.pending.get(id);
    if (pending !== undefined) pending.cancelled = true;
    return pending !== undefined;
  }

  cancelAll(): void {
    for (const pending of this.pending.values()) pending.cancelled = true;
  }

  // Ends the wait for `id`. Undefined means the spawn must not go ahead: it was cancelled, or it was
  // never pending at all.
  end(id: string): HeldFrames | undefined {
    const pending = this.pending.get(id);
    this.pending.delete(id);
    return pending?.cancelled === false ? pending : undefined;
  }
}
