import { PendingFrames } from './channel-pending.js';
import type { ClientFrame, RemoteProcessState, ServerFrame } from './protocol.js';

// One remote process id's I/O, and every map that is keyed by one. Kept out of `RemoteChannel`
// because the channel's own job is the transport's state machine — authenticating, framing,
// attaching — while this is the routing table underneath it: which listener owns an id, what was
// spawned under it, and what arrived for an id whose listener does not exist yet.

// What one remote process id wants from the inbound stream. Registered by the remote `PtySession`
// and the remote shell adapter, which are the only two shapes local code consumes.
export type SessionListener = {
  onOutput: (data: string) => void;
  onExit: (exitCode: number) => void;
};

type SpawnFrame = Extract<ClientFrame, { type: 'spawn' }>;
type OutputFrame = Extract<ServerFrame, { type: 'output' }>;
type ExitFrame = Extract<ServerFrame, { type: 'exit' }>;

export type SessionRouterHandlers = {
  onSessionExit?: (id: string, label: string | undefined, harness: boolean) => void;
  onTruncatedReplay?: () => void;
};

export class SessionRouter {
  private sessions = new Map<string, SessionListener>();
  private spawned = new Map<string, SpawnFrame>();
  private pending = new PendingFrames();
  // Whether an attach is settling on this channel and the hold is therefore earning its memory.
  // Frames arrive between the accepted result and the tabs it builds, and between the answer and
  // `discardUnclaimed`, so the gate is a window that brackets the whole attach rather than a live
  // read of the channel's state — an ordinary channel (no attach in flight) drops instead.
  private holding = false;

  constructor(private handlers: SessionRouterHandlers) {}

  // An attach is under way: hold what arrives for ids whose tabs are still being built. Opened by
  // the channel the moment its handshake will speak for an existing session, closed by
  // `discardUnclaimed`, by a settlement that ends the attach, or by the channel's own clear.
  openHold(): void { this.holding = true; }

  // Anything the far side already sent for this id is delivered here, in arrival order, before the
  // listener sees anything new — an attach after a restart replays into tabs that did not exist
  // when the replay arrived.
  attach(id: string, listener: SessionListener): void {
    this.sessions.set(id, listener);
    for (const frame of this.pending.claim(id)) {
      if (frame.type === 'output') { listener.onOutput(frame.data); continue; }
      this.sessions.delete(id);
      listener.onExit(frame.exitCode);
    }
    if (this.pending.overflowed()) this.handlers.onTruncatedReplay?.();
  }

  detach(id: string): void { this.sessions.delete(id); }

  // Everything still held for a process no tab was built for, and the window with it: once a
  // attach has created the tabs the far side's answer named, the channel is ordinary again and a
  // later frame with no listener is dropped, not held.
  discardUnclaimed(): void {
    this.pending.clear();
    this.holding = false;
  }

  record(frame: SpawnFrame): void { this.spawned.set(frame.id, frame); }

  forget(id: string): void { this.spawned.delete(id); }

  spawnedIds(): string[] { return [...this.spawned.keys()]; }

  // What this channel started, in the shape the far side describes its own live processes with. The
  // session record is built from this, so what is written down and what an attached peer answers
  // with are the same description of the same thing.
  spawnedProcesses(): RemoteProcessState[] {
    return [...this.spawned.values()].map((frame) => ({
      id: frame.id,
      program: frame.program,
      mode: frame.mode,
      ...(frame.harness !== undefined && { harness: frame.harness }),
      ...(frame.agentName !== undefined && { agentName: frame.agentName }),
    }));
  }

  output(frame: OutputFrame): void {
    const listener = this.sessions.get(frame.id);
    if (listener) listener.onOutput(frame.data);
    else if (this.holding) this.pending.hold(frame);
  }

  exit(frame: ExitFrame): void {
    const listener = this.sessions.get(frame.id);
    const spawned = this.spawned.get(frame.id);
    // An id this channel neither has a listener for nor spawned itself belongs to a process started
    // before this janissary existed — an attach whose tabs are still being built. Outside that
    // window there is nothing the frame could be delivered to, so it is dropped.
    if (!listener && !spawned) {
      if (this.holding) this.pending.hold(frame);
      return;
    }
    this.sessions.delete(frame.id);
    this.spawned.delete(frame.id);
    if (spawned && (spawned.harness || spawned.mode === 'pipe')) {
      this.handlers.onSessionExit?.(frame.id, spawned.agentName, spawned.harness !== undefined);
    }
    listener?.onExit(frame.exitCode);
  }

  // The deliberate end of a session: every listener is told its process is gone before the table is
  // emptied, so no tab is left waiting on output that will never come.
  finish(): void {
    for (const listener of this.sessions.values()) listener.onExit(1);
    this.clear();
  }

  clear(): void {
    this.sessions.clear();
    this.spawned.clear();
    this.pending.clear();
    this.holding = false;
  }
}
