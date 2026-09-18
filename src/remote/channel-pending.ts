import { encodeFrame, type ServerFrame } from './protocol.js';
import { PENDING_BUFFER_BUDGET_BYTES } from './serve-detach.js';

// Output and exit frames whose process id has no listener yet.
//
// A detached peer flushes its whole replay buffer the instant it accepts a reattach
// (`DetachedPeer.accept`), which is the right thing for the case that machinery was built for: the
// tabs were already open and only the transport had gone. A session reattached after janissary
// restarted has no tabs at all, and the frames arrive before the ones it is about to build — so
// dropping what has no listener would lose the first burst of every reattached process.
//
// Bounded by the same budget the far side holds itself to, and for the same reason: a peer that
// replays a megabyte into a janissary whose tabs never arrive must not grow this without limit. The
// oldest frames go first, which is what the truncation line the local side already has reports.

type PendingFrame = Extract<ServerFrame, { type: 'output' | 'exit' }>;

// The encoded length is kept beside each frame so a claim subtracts only what left, instead of
// re-encoding every survivor to recompute the total.
type HeldFrame = { frame: PendingFrame; bytes: number };

export class PendingFrames {
  private frames: HeldFrame[] = [];
  private bytes = 0;
  private dropped = false;

  hold(frame: PendingFrame): void {
    const bytes = encodeFrame(frame).length;
    this.frames.push({ frame, bytes });
    this.bytes += bytes;
    while (this.bytes > PENDING_BUFFER_BUDGET_BYTES) {
      const removed = this.frames.shift();
      if (!removed) break;
      this.bytes -= removed.bytes;
      this.dropped = true;
    }
  }

  // Everything held for this id, in arrival order, removed from the buffer. Arrival order is the
  // whole point: a process's output and the exit that ends it must reach its tab in the sequence the
  // far side produced them, or the tab shows a session that ended before it spoke.
  claim(id: string): PendingFrame[] {
    const claimed = this.frames.filter((held) => held.frame.id === id);
    if (claimed.length === 0) return [];
    this.frames = this.frames.filter((held) => held.frame.id !== id);
    this.bytes -= claimed.reduce((total, held) => total + held.bytes, 0);
    return claimed.map((held) => held.frame);
  }

  // Whether anything was dropped since this was last asked, clearing the flag so one overflow is
  // reported once rather than on every subsequent attach.
  overflowed(): boolean {
    const dropped = this.dropped;
    this.dropped = false;
    return dropped;
  }

  clear(): void {
    this.frames = [];
    this.bytes = 0;
    this.dropped = false;
  }
}
