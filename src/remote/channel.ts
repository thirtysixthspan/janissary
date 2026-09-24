import {
  HANDSHAKE_SENTINEL, decodeFrame, encodeFrame, heldBackLength, parseHandshake,
  type ClientFrame, type RemoteProcessState,
} from './protocol.js';
import { SessionRouter, type SessionListener } from './channel-sessions.js';
import { dispatchAcp, type AcpSessionListener } from './channel-acp.js';
import { dispatchSessionFrame } from './channel-dispatch.js';
import { CaptureRequestTracker, type CaptureResult } from './channel-capture.js';
import { ShutdownDrain } from './shutdown-drain.js';

export type { CaptureResult } from './channel-capture.js';
export type { SessionListener } from './channel-sessions.js';
export type { AcpSessionListener } from './channel-acp.js';
export type {
  ChannelTransport, NavigatorListener, ChannelFrame, RemoteChannelHandlers,
} from './channel-types.js';
import type { ChannelTransport, NavigatorListener, RemoteChannelHandlers } from './channel-types.js';

type ChannelState = 'authenticating' | 'attached' | 'closed' | 'reconnecting' | 'attaching';

export class RemoteChannel {
  private state: ChannelState = 'authenticating';
  private buffer = '';
  private navigators = new Map<string, NavigatorListener>();
  private acpSessions = new Map<string, AcpSessionListener>();
  private notifiedClose = false;
  private shutdownDrain = new ShutdownDrain();
  sessionId: string | undefined;
  private router: SessionRouter;
  private captures = new CaptureRequestTracker();

  constructor(private transport: ChannelTransport, private handlers: RemoteChannelHandlers) {
    this.router = new SessionRouter({
      onSessionExit: handlers.onSessionExit,
      onTruncatedReplay: handlers.onTruncatedReplay,
    });
  }

  // The transport's PTY id: what the tab's terminal is attached to while the channel authenticates.
  get ptyId(): string { return this.transport.id; }

  get attached(): boolean { return this.state === 'attached'; }

  // Route this process id's output and exit frames. The id is chosen by the caller and is the same
  // id the spawn frame carries.
  attach(id: string, listener: SessionListener): void { this.router.attach(id, listener); }

  detach(id: string): void { this.router.detach(id); }

  discardUnclaimed(): void { this.router.discardUnclaimed(); }

  // What this channel started, for the session record to be written from.
  spawnedProcesses(): RemoteProcessState[] { return this.router.spawnedProcesses(); }

  attachNavigator(id: string, listener: NavigatorListener): void {
    this.navigators.set(id, listener);
  }

  detachNavigator(id: string): void { this.navigators.delete(id); }

  // The same routing for an ACP session id, kept in its own map because an ACP session is not a
  // process: it has no output or exit frames, and its errors must not fault the channel.
  attachAcp(id: string, listener: AcpSessionListener): void { this.acpSessions.set(id, listener); }

  detachAcp(id: string): void { this.acpSessions.delete(id); }

  // Ask the far side for a fresh screen capture of process `id`, resolving with the reply, or
  // `undefined` on no capture yet or a channel that closes first (see `CaptureRequestTracker`).
  // `session` is the peer to ask: this channel's own `sessionId` while attached, or a parked
  // session's id for the one-off query a throwaway channel makes while fully detached.
  requestCapture(id: string, session: string): Promise<CaptureResult> {
    return this.captures.request(id, session, (frame) => this.send(frame));
  }

  send(frame: ClientFrame): void {
    if (this.state !== 'attached' && !(this.state === 'attaching' && frame.type === 'attach')) {
      switch (frame.type) {
      case 'filesystem-request': {
        this.navigators.get(frame.session)?.onReply({
          type: 'filesystem-reply', session: frame.session, request: frame.request, error: 'Remote connection unavailable.',
        });
        break;
      }
      case 'acp-open':
      case 'acp-prompt': {
        this.acpSessions.get(frame.id)?.onError('Remote connection unavailable.', frame.type === 'acp-open');
        break;
      }
      case 'capture-request': { this.captures.fail(frame.request, 'Remote connection unavailable.'); break; }
      default: { break; }
      }
      return;
    }
    if (frame.type === 'spawn') { this.router.record(frame); this.handlers.onProcesses?.(); }
    else if (frame.type === 'kill') { this.router.forget(frame.id); this.handlers.onProcesses?.(); }
    this.transport.write(`${encodeFrame(frame)}\n`);
  }

  // Raw bytes straight to the ssh session — keystrokes answering an authentication prompt.
  write(data: string): void {
    if (this.state === 'closed' || this.state === 'reconnecting') return;
    this.transport.write(data);
  }

  close(): void {
    this.shutdownDrain.cancel();
    this.transport.kill();
  }

  disconnect(): void {
    this.state = 'closed';
    this.transport.kill();
  }

  replaceTransport(transport: ChannelTransport): void {
    this.transport = transport;
    this.state = 'authenticating';
    this.buffer = '';
    this.notifiedClose = false;
  }

  finish(): void {
    for (const id of this.router.spawnedIds()) this.send({ type: 'kill', id });
    for (const id of this.acpSessions.keys()) this.send({ type: 'acp-close', id });
    for (const session of this.navigators.keys()) this.send({ type: 'filesystem-close', session });
    this.send({ type: 'shutdown' });
    this.state = 'closed';
    this.sessionId = undefined;
    this.router.finish();
    for (const listener of this.navigators.values()) listener.onClose?.();
    this.navigators.clear();
    for (const listener of this.acpSessions.values()) listener.onError('Remote session ended.', true);
    this.acpSessions.clear();
    this.captures.settleAll();
    this.state = 'closed';
  }

  // A PTY kill can discard bytes that have been written but not yet delivered to ssh. Leave the
  // transport up briefly after the final shutdown frame, while still bounding a peer that cannot
  // exit on its own.
  closeAfterShutdown(): void {
    this.shutdownDrain.schedule(() => this.close());
  }

  // Everything the ssh PTY produced, in arrival order.
  receive(data: string): void {
    if (this.state === 'closed' || this.state === 'reconnecting') return;
    this.buffer += data;
    // Both run in the same read: the handshake line may sit in the middle of a chunk whose tail is
    // already frames, so the terminal phase can hand straight over to the frame phase.
    if (this.state === 'authenticating') this.consumeTerminalPhase();
    if (this.attached || this.state === 'attaching') this.consumeFrames();
  }

  // The ssh session ended, for any reason. Notifies the owner exactly once.
  closed(): void {
    if (this.notifiedClose) return;
    this.notifiedClose = true;
    this.shutdownDrain.cancel();
    if (this.sessionId) {
      this.captures.settleAll();
      this.state = 'reconnecting';
      this.buffer = '';
      this.handlers.onClose();
      return;
    }
    this.state = 'closed';
    this.router.clear();
    for (const listener of this.navigators.values()) listener.onClose?.();
    this.navigators.clear();
    this.acpSessions.clear();
    this.captures.settleAll();
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
    this.state = this.sessionId ? 'attaching' : 'attached';
    // A handshake that speaks for an existing session opens the hold window: the peer is about to
    // flush its replay and the tabs that will claim it may not exist yet. It closed by
    // `discardUnclaimed` once those tabs are built — or by the settlement that ends the attach.
    if (this.state === 'attaching') this.router.openHold();
    this.sessionId ??= handshake.session;
    this.handlers.onAttached(handshake);
  }

  private consumeFrames(): void {
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.dispatch(line);
      if (this.state !== 'attached' && this.state !== 'attaching') return;
      newline = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    const frame = decodeFrame(line);
    // A line the far side printed rather than framed. Killing the transport over it took the whole
    // session with it, including the `shutdown` already queued behind it — so a remote harness
    // outlived the tab that closed it and kept its workspace. It goes to the terminal handler, which
    // is where the far side's own output already goes before the handshake.
    if (!('type' in frame) && frame.stray === true) { this.handlers.onTerminalData(line); return; }
    if (!('type' in frame)) { this.fail(frame.error); return; }
    if (frame.type === 'attach-result' && frame.accepted) this.state = 'attached';
    if (dispatchSessionFrame(frame, this.router, this.captures)) return;
    if (frame.type === 'filesystem-reply') {
      this.navigators.get(frame.session)?.onReply(frame);
      return;
    }
    if (frame.type === 'filesystem-event') {
      this.navigators.get(frame.session)?.onEvent(frame.path);
      return;
    }
    if (dispatchAcp(this.acpSessions, frame)) return;
    switch (frame.type) {
    case 'workspace-ready':
    case 'attach-result':
    case 'session-state-result':
    case 'workspace-failed':
    case 'name-in-use':
    case 'browser-exited':
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
