import {
  HANDSHAKE_SENTINEL, decodeFrame, encodeFrame, heldBackLength, parseHandshake,
  type ClientFrame, type RemoteFrame, type RemoteHandshake, type ServerFrame,
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

// What one remote ACP session id wants from the inbound stream. Registered by the local ACP
// adapter, which is the only shape that consumes these frames.
export type AcpSessionListener = {
  onReady: () => void;
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  // `fatal` says whether the session itself is gone (a failed spawn, a dead agent) or only this
  // prompt failed (a rate limit). The adapter routes the two to different places.
  onError: (message: string, fatal: boolean) => void;
};

// The frames that belong to the tab rather than to one process's I/O: the provisioning answer, the
// transcript pushes, and the browser-gone report. Everything else inbound is routed to a
// `SessionListener` instead. `browser-exited` carries a session id but is not that session's
// output — the tab it names is resolved by the manager, since joined tabs share a channel.
export type ChannelFrame = Extract<ServerFrame, { type: 'workspace-ready' | 'workspace-failed' | 'transcript' | 'browser-exited' | 'reattach-result' }>;

export type RemoteChannelHandlers = {
  // Bytes produced before the handshake — ssh's banner, motd, and authentication prompts.
  onTerminalData: (data: string) => void;
  onAttached: (handshake: RemoteHandshake) => void;
  onFrame: (frame: ChannelFrame) => void;
  // A protocol-level fault (a version mismatch, a frame outside the union). Closes the channel.
  onError: (message: string) => void;
  onClose: () => void;
  onSessionExit?: (id: string, label: string | undefined, harness: boolean) => void;
};

type ChannelState = 'authenticating' | 'attached' | 'closed' | 'reconnecting' | 'reattaching';

export class RemoteChannel {
  private state: ChannelState = 'authenticating';
  private buffer = '';
  private sessions = new Map<string, SessionListener>();
  private navigators = new Map<string, NavigatorListener>();
  private acpSessions = new Map<string, AcpSessionListener>();
  private notifiedClose = false;
  sessionId: string | undefined;
  private spawned = new Map<string, Extract<ClientFrame, { type: 'spawn' }>>();

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

  // The same routing for an ACP session id, kept in its own map because an ACP session is not a
  // process: it has no output or exit frames, and its errors must not fault the channel.
  attachAcp(id: string, listener: AcpSessionListener): void { this.acpSessions.set(id, listener); }

  detachAcp(id: string): void { this.acpSessions.delete(id); }

  send(frame: ClientFrame): void {
    if (this.state !== 'attached' && !(this.state === 'reattaching' && frame.type === 'reattach')) {
      if (frame.type === 'filesystem-request') this.navigators.get(frame.session)?.onReply({
        type: 'filesystem-reply', session: frame.session, request: frame.request, error: 'Remote connection unavailable.',
      });
      else if (frame.type === 'acp-open' || frame.type === 'acp-prompt') {
        this.acpSessions.get(frame.id)?.onError('Remote connection unavailable.', frame.type === 'acp-open');
      }
      return;
    }
    if (frame.type === 'spawn') this.spawned.set(frame.id, frame);
    else if (frame.type === 'kill') this.spawned.delete(frame.id);
    this.transport.write(`${encodeFrame(frame)}\n`);
  }

  // Raw bytes straight to the ssh session — keystrokes answering an authentication prompt.
  write(data: string): void {
    if (this.state === 'closed' || this.state === 'reconnecting') return;
    this.transport.write(data);
  }

  close(): void { this.transport.kill(); }

  replaceTransport(transport: ChannelTransport): void {
    this.transport = transport;
    this.state = 'authenticating';
    this.buffer = '';
    this.notifiedClose = false;
  }

  finish(): void {
    for (const id of this.spawned.keys()) this.send({ type: 'kill', id });
    for (const id of this.acpSessions.keys()) this.send({ type: 'acp-close', id });
    for (const session of this.navigators.keys()) this.send({ type: 'filesystem-close', session });
    this.send({ type: 'shutdown' });
    this.state = 'closed';
    this.sessionId = undefined;
    for (const listener of this.sessions.values()) listener.onExit(1);
    this.sessions.clear();
    for (const listener of this.navigators.values()) listener.onClose?.();
    this.navigators.clear();
    for (const listener of this.acpSessions.values()) listener.onError('Remote session ended.', true);
    this.acpSessions.clear();
    this.spawned.clear();
    this.state = 'closed';
  }

  // Everything the ssh PTY produced, in arrival order.
  receive(data: string): void {
    if (this.state === 'closed' || this.state === 'reconnecting') return;
    this.buffer += data;
    // Both run in the same read: the handshake line may sit in the middle of a chunk whose tail is
    // already frames, so the terminal phase can hand straight over to the frame phase.
    if (this.state === 'authenticating') this.consumeTerminalPhase();
    if (this.attached || this.state === 'reattaching') this.consumeFrames();
  }

  // The ssh session ended, for any reason. Notifies the owner exactly once.
  closed(): void {
    if (this.notifiedClose) return;
    this.notifiedClose = true;
    if (this.sessionId) {
      this.state = 'reconnecting';
      this.buffer = '';
      this.handlers.onClose();
      return;
    }
    this.state = 'closed';
    this.sessions.clear();
    for (const listener of this.navigators.values()) listener.onClose?.();
    this.navigators.clear();
    this.acpSessions.clear();
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
    this.state = this.sessionId ? 'reattaching' : 'attached';
    this.sessionId ??= handshake.session;
    this.handlers.onAttached(handshake);
  }

  private consumeFrames(): void {
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.dispatch(line);
      if (this.state !== 'attached' && this.state !== 'reattaching') return;
      newline = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    const frame = decodeFrame(line);
    if (!('type' in frame)) { this.fail(frame.error); return; }
    if (frame.type === 'reattach-result' && frame.accepted) this.state = 'attached';
    if (frame.type === 'output') { this.sessions.get(frame.id)?.onOutput(frame.data); return; }
    if (frame.type === 'exit') {
      const listener = this.sessions.get(frame.id);
      this.sessions.delete(frame.id);
      const spawned = this.spawned.get(frame.id);
      this.spawned.delete(frame.id);
      if (spawned && (spawned.harness || spawned.mode === 'pipe')) {
        this.handlers.onSessionExit?.(frame.id, spawned.agentName, spawned.harness !== undefined);
      }
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
    if (this.dispatchAcp(frame)) return;
    switch (frame.type) {
    case 'workspace-ready':
    case 'reattach-result':
    case 'workspace-failed':
    case 'browser-exited':
    case 'transcript': { this.handlers.onFrame(frame); return; }
    default: { this.fail(`Unexpected remote frame "${frame.type}".`); }
    }
  }

  // Routed by id before the switch that ends in `fail`, so an agent that fails to spawn or errors
  // mid-prompt never kills the transport — killing the transport closes the tab, and an ACP-level
  // error is not a channel-level fault. A frame whose id has no listener is dropped, which is what
  // stops a chunk still in flight from a session disposed by `acp reset` landing in its successor.
  // Returns whether the frame was an ACP one at all.
  private dispatchAcp(frame: RemoteFrame): boolean {
    switch (frame.type) {
    case 'acp-ready': { this.acpSessions.get(frame.id)?.onReady(); return true; }
    case 'acp-chunk': { this.acpSessions.get(frame.id)?.onChunk(frame.text); return true; }
    case 'acp-end': { this.acpSessions.get(frame.id)?.onEnd(frame.stopReason); return true; }
    case 'acp-error': { this.acpSessions.get(frame.id)?.onError(frame.message, frame.fatal); return true; }
    default: { return false; }
    }
  }

  private fail(message: string): void {
    this.handlers.onError(message);
    this.state = 'closed';
    this.transport.kill();
  }
}
