import {
  HANDSHAKE_SENTINEL, decodeFrame, encodeFrame, heldBackLength, parseHandshake,
  type ClientFrame, type RemoteHandshake, type ServerFrame,
} from './protocol.js';

// One ssh session's lifetime and its state machine. Until `remote-serve` announces itself the
// session is a plain terminal: bytes pass through to the tab's terminal and keystrokes pass through
// to the PTY, so ssh's own password, key-passphrase, host-key-verification, and keyboard-interactive
// prompts render and can be answered in the tab. The sentinel handshake line flips the channel to
// `attached`, after which every byte is a frame.
//
// The transport is injected rather than spawned here so the state machine can be driven over a fake
// PTY in tests; `RemoteManager` supplies the real one (an `ssh -t … janus remote-serve` PTY).
export type ChannelTransport = {
  id: string;
  write: (data: string) => void;
  kill: () => void;
};

// What one remote process id wants from the inbound stream. Registered by the remote `PtySession`
// and the remote shell adapter, which are the only two shapes local code consumes.
export type SessionListener = {
  onOutput: (data: string) => void;
  onExit: (exitCode: number) => void;
};

export type NavigatorListener = {
  onReply: (frame: Extract<ServerFrame, { type: 'filesystem-reply' }>) => void;
  onEvent: (path: string) => void;
  onClose?: () => void;
};

// The frames that are not addressed to a single process: the provisioning answer and the transcript
// pushes. Everything else inbound is routed to a `SessionListener` instead.
export type ChannelFrame = Extract<ServerFrame, { type: 'workspace-ready' | 'workspace-failed' | 'transcript' }>;

export type RemoteChannelHandlers = {
  // Bytes produced before the handshake — ssh's banner, motd, and authentication prompts.
  onTerminalData: (data: string) => void;
  onAttached: (handshake: RemoteHandshake) => void;
  onFrame: (frame: ChannelFrame) => void;
  // A protocol-level fault (a version mismatch, a frame outside the union). Closes the channel.
  onError: (message: string) => void;
  onClose: () => void;
};

type ChannelState = 'authenticating' | 'attached' | 'closed';

export class RemoteChannel {
  private state: ChannelState = 'authenticating';
  private buffer = '';
  private sessions = new Map<string, SessionListener>();
  private navigators = new Map<string, NavigatorListener>();
  private notifiedClose = false;

  constructor(private transport: ChannelTransport, private handlers: RemoteChannelHandlers) {}

  // The transport's PTY id: what the tab's terminal is attached to while the channel authenticates.
  get ptyId(): string { return this.transport.id; }

  get attached(): boolean { return this.state === 'attached'; }

  // Route this process id's output and exit frames. The id is chosen by the caller and is the same
  // id the spawn frame carries.
  attach(id: string, listener: SessionListener): void { this.sessions.set(id, listener); }

  detach(id: string): void { this.sessions.delete(id); }

  attachNavigator(id: string, listener: NavigatorListener): void {
    this.navigators.set(id, listener);
  }

  detachNavigator(id: string): void { this.navigators.delete(id); }

  send(frame: ClientFrame): void {
    if (this.state !== 'attached') return;
    this.transport.write(`${encodeFrame(frame)}\n`);
  }

  // Raw bytes straight to the ssh session — keystrokes answering an authentication prompt.
  write(data: string): void {
    if (this.state === 'closed') return;
    this.transport.write(data);
  }

  close(): void { this.transport.kill(); }

  // Everything the ssh PTY produced, in arrival order.
  receive(data: string): void {
    if (this.state === 'closed') return;
    this.buffer += data;
    // Both run in the same read: the handshake line may sit in the middle of a chunk whose tail is
    // already frames, so the terminal phase can hand straight over to the frame phase.
    if (this.state === 'authenticating') this.consumeTerminalPhase();
    if (this.attached) this.consumeFrames();
  }

  // The ssh session ended, for any reason. Notifies the owner exactly once.
  closed(): void {
    if (this.notifiedClose) return;
    this.notifiedClose = true;
    this.state = 'closed';
    this.sessions.clear();
    for (const listener of this.navigators.values()) listener.onClose?.();
    this.navigators.clear();
    this.handlers.onClose();
  }

  // Pass bytes to the terminal until the sentinel appears, holding back only a tail that could be
  // the sentinel split across two reads (so a newline-less `password:` prompt still renders).
  private consumeTerminalPhase(): void {
    const index = this.buffer.indexOf(HANDSHAKE_SENTINEL);
    if (index === -1) {
      const keep = heldBackLength(this.buffer);
      const ready = this.buffer.slice(0, this.buffer.length - keep);
      this.buffer = this.buffer.slice(this.buffer.length - keep);
      if (ready) this.handlers.onTerminalData(ready);
      return;
    }
    if (index > 0) {
      this.handlers.onTerminalData(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index);
    }
    const newline = this.buffer.indexOf('\n');
    if (newline === -1) return;
    const line = this.buffer.slice(0, newline);
    this.buffer = this.buffer.slice(newline + 1);
    const handshake = parseHandshake(line);
    if ('error' in handshake) { this.fail(handshake.error); return; }
    this.state = 'attached';
    this.handlers.onAttached(handshake);
  }

  private consumeFrames(): void {
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.dispatch(line);
      if (this.state !== 'attached') return;
      newline = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    const frame = decodeFrame(line);
    if (!('type' in frame)) { this.fail(frame.error); return; }
    if (frame.type === 'output') { this.sessions.get(frame.id)?.onOutput(frame.data); return; }
    if (frame.type === 'exit') {
      const listener = this.sessions.get(frame.id);
      this.sessions.delete(frame.id);
      listener?.onExit(frame.exitCode);
      return;
    }
    if (frame.type === 'filesystem-reply') {
      this.navigators.get(frame.session)?.onReply(frame);
      return;
    }
    if (frame.type === 'filesystem-event') {
      this.navigators.get(frame.session)?.onEvent(frame.path);
      return;
    }
    switch (frame.type) {
    case 'workspace-ready':
    case 'workspace-failed':
    case 'transcript': { this.handlers.onFrame(frame); return; }
    default: { this.fail(`Unexpected remote frame "${frame.type}".`); }
    }
  }

  private fail(message: string): void {
    this.handlers.onError(message);
    this.state = 'closed';
    this.transport.kill();
  }
}
