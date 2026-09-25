import type { WorkspaceManager } from '../workspace/manager.js';
import { createTranscriptSource } from '../harness/transcript/sources.js';
import type { TranscriptSource } from '../harness/transcript/source.js';
import { decodeFrame, encodeFrame, encodeHandshake, type ClientFrame, type ServerFrame } from './protocol.js';
import type { RootOfferRun } from './serve-root-offer.js';
import { rootForProvision, rootForRelay, settleRoot, startPeer, type SettledRoot } from './serve-root-settle.js';
import type { RemoteProcesses } from './serve-processes.js';
import type { RemoteAcp } from './serve-acp.js';
import type { RemoteFileNavigators } from './serve-file-navigator.js';
import { provisionRemoteWorkspace } from './serve-provision.js';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import { relayPeer, type DetachedPeer } from './serve-detach.js';
import { answerCaptureRequest } from './serve-detach-query.js';

// `janus remote-serve [<project-dir>]`: the far end of a remote janissary session. It runs attached
// inside an ordinary ssh session, takes no instance lock, starts no HTTP server, opens no window,
// and writes nothing to `.janissary/log/`. Its capability surface is deliberately closed — it will
// not open tabs, serve files, run anything outside the workspace it provisions, or accept a frame
// outside the union.

// How often the harness's own session record is re-read and pushed, matching the local tailer's
// cadence (`src/harness/transcript/tailer.ts`).
const TRANSCRIPT_POLL_MS = 2000;

type ProvisionFrame = Extract<ClientFrame, { type: 'provision' }>;

export type RemoteServerOptions = {
  // The root-dependent setup (`settleRoot`), injectable so a test can settle a root without loading
  // this process's config or trusting a workspace in the real home directory.
  settle?: (root: string) => WorkspaceManager;
  // The remote user's home directory, for the root classifier and the clone lock.
  home?: string;
};

function writeFrame(frame: ServerFrame): void {
  process.stdout.write(`${encodeFrame(frame)}\n`);
}

export class RemoteServer {
  private root: string | undefined;
  private workspaces: WorkspaceManager | undefined;
  private processes: RemoteProcesses | undefined;
  private files: RemoteFileNavigators | undefined;
  private acp: RemoteAcp | undefined;
  private workspaceDir: string | undefined;
  private transcript: TranscriptSource | undefined;
  private transcriptTimer: NodeJS.Timeout | undefined;
  private buffer = '';
  private stopping = false;
  private listening = false;
  private offer: RootOfferRun | undefined;
  readonly sessionId = randomUUID();
  private peer: DetachedPeer | undefined;
  private relay: Socket | undefined;

  constructor(
    private pathArgument: string | undefined,
    private emit: (frame: ServerFrame) => void = writeFrame,
    private exit: (code: number) => void = (code) => process.exit(code),
    private options: RemoteServerOptions = {},
  ) {}

  // The handshake goes out at once and carries no root: the root is settled by the first frame that
  // needs one, and until then there is no peer, so frames are written straight to stdout.
  listen(): void {
    this.listening = true;
    process.stdout.write(`${encodeHandshake(this.sessionId)}\n`);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { this.receive(chunk); });
    process.stdin.on('end', () => { this.detach(); });
    process.stdin.on('error', () => this.detach());
    process.stdout.on('error', () => this.detach());
    process.stdin.resume();
  }

  // Everything the local side wrote, in arrival order. Newline-delimited, so a frame split across
  // two reads is buffered until it is complete.
  receive(chunk: string): void {
    if (this.relay) { this.relay.write(chunk); return; }
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.dispatch(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  // Kill every process this server started and remove its workspace clone, then exit. A pending
  // clone offer goes first: an unanswered prompt is declined, and a running root clone is killed and
  // its partial folder removed.
  shutdown(code: number): void {
    if (this.stopping) return;
    this.stopping = true;
    this.offer?.cancel();
    this.peer?.dispose();
    this.relay?.destroy();
    if (this.transcriptTimer) clearInterval(this.transcriptTimer);
    this.files?.dispose();
    this.processes?.killAll();
    // Before the clone goes, so it is never removed out from under a live agent.
    this.acp?.dispose();
    this.workspaces?.removeAll();
    this.exit(code);
  }

  // Every way this server can refuse or fail reaches the local side the same way: the placeholder
  // tab's `provisionError`, then an auto-close.
  private refuse(message: string): void {
    this.emit({ type: 'workspace-failed', message });
  }

  private dispatch(line: string): void {
    const frame = decodeFrame(line);
    if (!('type' in frame)) { this.refuse(frame.error); return; }
    switch (frame.type) {
    case 'attach': { this.attach(frame); return; }
    // Answered before the workspace exists too, with an empty list: a peer that has not provisioned
    // is holding nothing, which is a fact worth stating rather than a refusal to explain.
    case 'session-state': {
      this.emit({ type: 'session-state-result', processes: this.processes?.states() ?? [] });
      return;
    }
    case 'shutdown': { this.shutdown(0); return; }
    case 'provision': { void this.provision(frame); return; }
    case 'clone-answer': { if (!this.offer?.answer(frame.accept)) this.refuse('Unexpected remote frame "clone-answer".'); return; }
    case 'spawn': { this.spawn(frame); return; }
    // Retained before it is delivered, so what the peer replays is in the order it saw the two
    // directions — which is what pairs a command with the output it produced.
    case 'input': { this.peer?.input(frame); this.processes?.input(frame.id, frame.data); return; }
    case 'resize': { this.processes?.resize(frame.id, frame.cols, frame.rows); return; }
    case 'kill': { this.processes?.kill(frame.id); return; }
    case 'capture-request': { answerCaptureRequest(frame, this.processes, this.lookupRoot(), (f) => this.emit(f)); return; }
    case 'filesystem-open': {
      if (!this.files) { this.refuse('No remote workspace has been provisioned.'); return; }
      this.files.open(frame.session);
      return;
    }
    case 'filesystem-close': { this.files?.close(frame.session); return; }
    case 'filesystem-request': {
      if (!this.files) { this.refuse('No remote workspace has been provisioned.'); return; }
      this.files.request(frame);
      return;
    }
    case 'acp-open': { if (this.requireWorkspace()) this.acp?.open(frame); return; }
    case 'acp-prompt': { if (this.requireWorkspace()) this.acp?.prompt(frame); return; }
    case 'acp-close': { this.acp?.close(frame.id); return; }
    default: { this.refuse(`Unexpected remote frame "${frame.type}".`); }
    }
  }

  // The root a relaying process reaches a parked peer through: this server's own once settled.
  private lookupRoot(): string | undefined {
    return this.root ?? rootForRelay(this.pathArgument, this.options.home);
  }

  // A parked peer's record cannot exist without a root, so no root answers as a missing session does.
  private attach(frame: Extract<ClientFrame, { type: 'attach' }>): void {
    const root = this.workspaceDir ? undefined : this.lookupRoot();
    if (root === undefined) { this.emit({ type: 'attach-result', accepted: false }); return; }
    this.relay = relayPeer(root, frame.session, (data) => { process.stdout.write(data); }, (terminated) => {
      if (terminated) this.emit({ type: 'attach-result', accepted: false });
      this.shutdown(terminated ? 0 : 1);
    }, frame.restore);
  }

  // Settle the root if this is the first provision (see `serve-root-settle.ts`), then check the
  // label and clone the root's `origin` under it (see `serve-provision.ts`).
  private async provision(frame: ProvisionFrame): Promise<void> {
    let cloned: SettledRoot['cloned'];
    if (!this.workspaces) {
      if (this.offer) return;
      const settled = await rootForProvision(frame, {
        pathArgument: this.pathArgument, home: this.options.home, emit: (f) => this.emit(f),
        offering: (run) => { this.offer = run; }, stopping: () => this.stopping,
      });
      if (!settled || !await this.settleAt(settled.root)) return;
      cloned = settled.cloned;
    }
    const workspaces = this.workspaces;
    if (!workspaces) return;
    await provisionRemoteWorkspace({
      emit: (f) => this.emit(f),
      workspaces,
      peer: this.peer,
      idle: () => !this.processes && !this.stopping,
      stopping: () => this.stopping,
      provisioned: ({ dir, processes, files, acp }) => {
        this.workspaceDir = dir;
        this.processes = processes;
        this.files = files;
        this.acp = acp;
      },
    }, frame.label, frame.tokens ?? {}, frame.identity ?? {}, cloned);
  }

  // Run the root-dependent setup, then start the detached peer and route every frame through it —
  // only while listening on a real transport, since only then is there a session to park.
  private async settleAt(root: string): Promise<boolean> {
    this.root = root;
    this.workspaces = (this.options.settle ?? settleRoot)(root);
    if (!this.listening) return true;
    this.peer = await startPeer(root, this.sessionId, (data) => this.receive(data), () => this.shutdown(0),
      (id) => this.processes?.latestCapture(id), () => this.processes?.busyStates() ?? []);
    if (!this.peer) { this.shutdown(1); return false; }
    this.emit = (frame) => this.peer?.emit(frame);
    return true;
  }

  private spawn(frame: Extract<ClientFrame, { type: 'spawn' }>): void {
    if (!this.requireWorkspace()) return;
    this.peer?.track(frame);
    // A process that will not start is that process's failure, not the session's: it answers as an
    // exit, which also drops what the peer tracked a line above, and every other frame keeps working.
    try {
      this.processes?.spawn(frame);
    } catch {
      this.emit({ type: 'exit', id: frame.id, exitCode: 1 });
      return;
    }
    if (frame.harness !== undefined) this.followTranscript(frame.harness);
  }

  // Give up the transport while leaving the session running: the peer holds its workspace and its
  // processes and waits out `REMOTE_DETACH_TIMEOUT_MS` for someone to attach. Raised by SIGHUP and
  // by stdin/stdout going away, which are the same event seen from two directions.
  //
  // A process that is relaying into someone else's parked peer has no session of its own to park, so
  // it exits instead — the peer it was relaying to keeps waiting, untouched. So does one whose root
  // was never settled: there is no peer to park, only a pending offer or clone to cancel.
  detach(): void {
    if (this.relay || this.root === undefined) { this.shutdown(0); return; }
    this.buffer = '';
    this.peer?.detach();
  }

  // Nothing this server runs exists outside the clone it provisioned, so every frame that starts
  // work shares one refusal rather than inventing a second wording for the same fault.
  private requireWorkspace(): boolean {
    if (this.processes) return true;
    this.refuse('No remote workspace has been provisioned.');
    return false;
  }

  // The harness's session record lives in this machine's dot directory, so the ordinary source
  // builder runs here and each poll's blocks are pushed to the local tailer.
  private followTranscript(harness: string): void {
    const dir = this.workspaceDir;
    if (this.transcript || dir === undefined) return;
    const source = createTranscriptSource(harness, dir, Date.now());
    if (!source) return;
    this.transcript = source;
    this.transcriptTimer = setInterval(() => {
      const blocks = source.poll();
      if (blocks.length > 0) this.emit({ type: 'transcript', blocks });
    }, TRANSCRIPT_POLL_MS);
    this.transcriptTimer.unref();
  }
}
