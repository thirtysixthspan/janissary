import { loadConfig } from '../config.js';
import { getProjectTokens, loadProjectTokens, type ProjectTokens } from '../project/tokens.js';
import { loadGitIdentity, setGitIdentity, type GitIdentity } from '../git/identity.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { sandboxNotice } from '../sandbox/index.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { createTranscriptSource } from '../harness/transcript/sources.js';
import type { TranscriptSource } from '../harness/transcript/source.js';
import { decodeFrame, encodeFrame, encodeHandshake, type ClientFrame, type ServerFrame } from './protocol.js';
import { resolveRemoteRoot } from './serve-root.js';
import { RemoteProcesses } from './serve-processes.js';
import { RemoteAcp } from './serve-acp.js';
import { githubTokenNotice, workspaceReadyNotice } from './serve-notice.js';
import { RemoteFileNavigators } from './serve-file-navigator.js';
import { errorText } from '../error-text.js';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import { DetachedPeer, relayPeer } from './serve-detach.js';

// `janus remote-serve [<project-dir>]`: the far end of a remote janissary session. It runs attached
// inside an ordinary ssh session, takes no instance lock, starts no HTTP server, opens no window,
// and writes nothing to `.janissary/log/`. Its capability surface is deliberately closed — it will
// not open tabs, serve files, run anything outside the workspace it provisions, or accept a frame
// outside the union.

// How often the harness's own session record is re-read and pushed, matching the local tailer's
// cadence (`src/harness/transcript/tailer.ts`).
const TRANSCRIPT_POLL_MS = 2000;

// SIGHUP is what arrives when the ssh channel drops; the other two cover an ordinary kill. The two
// facts used to be one — all three meant the session was over and its workspace clone went with it —
// and are now deliberately different. A dropped channel is not evidence the user is finished with
// the session, only that the transport went, so SIGHUP parks the peer and waits to be attached
// (`DetachedPeer`, `REMOTE_DETACH_TIMEOUT_MS`). A signal aimed at this process is evidence: SIGTERM
// and SIGINT still end the session and remove the clone, as does the local side's explicit
// `shutdown` frame. Removing the SIGHUP branch would silently restore destroy-on-disconnect, which
// is the behavior detachable sessions exist to end.
export const CHANNEL_SIGNALS = ['SIGHUP', 'SIGTERM', 'SIGINT'] as const;

function writeFrame(frame: ServerFrame): void {
  process.stdout.write(`${encodeFrame(frame)}\n`);
}

export class RemoteServer {
  private workspaces: WorkspaceManager;
  private processes: RemoteProcesses | undefined;
  private files: RemoteFileNavigators | undefined;
  private acp: RemoteAcp | undefined;
  private workspaceDir: string | undefined;
  private transcript: TranscriptSource | undefined;
  private transcriptTimer: NodeJS.Timeout | undefined;
  private buffer = '';
  private stopping = false;
  readonly sessionId = randomUUID();
  private peer: DetachedPeer | undefined;
  private relay: Socket | undefined;

  constructor(
    private root: string,
    private emit: (frame: ServerFrame) => void = writeFrame,
    private exit: (code: number) => void = (code) => process.exit(code),
  ) {
    this.workspaces = new WorkspaceManager(root);
  }

  listen(): void {
    this.peer = new DetachedPeer(this.root, this.sessionId, (data) => this.receive(data), () => this.shutdown(0));
    this.emit = (frame) => this.peer?.emit(frame);
    void this.peer.start((data) => { process.stdout.write(data); }).then(() => {
      process.stdout.write(`${encodeHandshake(this.root, this.sessionId)}\n`);
    }).catch(() => this.shutdown(1));
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { this.receive(chunk); });
    process.stdin.on('end', () => { this.detach(); });
    process.stdin.on('error', () => this.detach());
    process.stdout.on('error', () => this.detach());
    wireShutdown(this);
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

  // Kill every process this server started and remove its workspace clone, then exit.
  shutdown(code: number): void {
    if (this.stopping) return;
    this.stopping = true;
    this.peer?.dispose();
    this.relay?.destroy();
    if (this.transcriptTimer) clearInterval(this.transcriptTimer);
    this.files?.dispose();
    this.processes?.killAll();
    // Before the clone goes, so it is never removed out from under a live agent.
    this.acp?.dispose();
    this.workspaces.removeAll();
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
    case 'attach': {
      if (this.workspaceDir) { this.emit({ type: 'attach-result', accepted: false }); return; }
      this.relay = relayPeer(this.root, frame.session, (data) => { process.stdout.write(data); }, (terminated) => {
        if (terminated) this.emit({ type: 'attach-result', accepted: false });
        this.shutdown(terminated ? 0 : 1);
      }, frame.restore);
      return;
    }
    // Answered before the workspace exists too, with an empty list: a peer that has not provisioned
    // is holding nothing, which is a fact worth stating rather than a refusal to explain.
    case 'session-state': {
      this.emit({ type: 'session-state-result', processes: this.processes?.states() ?? [] });
      return;
    }
    case 'shutdown': { this.shutdown(0); return; }
    case 'provision': { void this.provision(frame.label, frame.tokens ?? {}, frame.identity ?? {}); return; }
    case 'spawn': { this.spawn(frame); return; }
    // Retained before it is delivered, so what the peer replays is in the order it saw the two
    // directions — which is what pairs a command with the output it produced.
    case 'input': { this.peer?.input(frame); this.processes?.input(frame.id, frame.data); return; }
    case 'resize': { this.processes?.resize(frame.id, frame.cols, frame.rows); return; }
    case 'kill': { this.processes?.kill(frame.id); return; }
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

  // Clone the project root's `origin` into `.janissary/workspace/<label>` under this root, using the
  // very same `WorkspaceManager` the local server uses for a `-w` launch.
  private async provision(label: string, forwarded: ProjectTokens, identity: GitIdentity): Promise<void> {
    if (this.processes || this.stopping) return;
    const result = this.workspaces.create(label);
    if ('error' in result) { this.refuse(result.error); return; }
    try {
      await result.ready;
    } catch (error) {
      this.refuse(errorText(error));
      return;
    }
    if (this.stopping) { this.workspaces.removeAll(); return; }
    this.workspaceDir = result.dir;
    const own = getProjectTokens();
    // Per token, a forwarded value wins and this machine's own file is the fallback — spreading own
    // first and forwarded over it says exactly that, since `loadProjectTokens` omits absent
    // credentials rather than storing them as undefined.
    //
    // Only the GitHub credential gets a notice. A missing harness credential announces itself in
    // that harness's own output the moment it starts, and most remote launches have none configured
    // on either machine and are working as intended, so a mirrored notice would speak on the
    // ordinary case rather than warn about anything.
    const tokens = { ...own, ...forwarded };
    // The identity, unlike the tokens, is replaced whole or not at all: a name from the local
    // machine paired with an email from this one belongs to nobody, so a forwarded identity either
    // stands on its own or this machine's own stays as the fallback.
    if (Object.keys(identity).length > 0) setGitIdentity(identity);
    this.processes = new RemoteProcesses((frame) => this.emit(frame), result.dir, label, tokens);
    this.files = new RemoteFileNavigators((frame) => this.emit(frame), result.dir);
    this.acp = new RemoteAcp((frame) => this.emit(frame), result.dir, tokens);
    this.emit({
      type: 'workspace-ready',
      dir: result.dir,
      notice: workspaceReadyNotice(sandboxNotice(), githubTokenNotice(forwarded.github, own.github)),
    });
  }

  private spawn(frame: Extract<ClientFrame, { type: 'spawn' }>): void {
    if (!this.requireWorkspace()) return;
    this.peer?.track(frame);
    this.processes?.spawn(frame);
    if (frame.harness !== undefined) this.followTranscript(frame.harness);
  }

  // Give up the transport while leaving the session running: the peer holds its workspace and its
  // processes and waits out `REMOTE_DETACH_TIMEOUT_MS` for someone to attach. Raised by SIGHUP and
  // by stdin/stdout going away, which are the same event seen from two directions.
  //
  // A process that is relaying into someone else's parked peer has no session of its own to park, so
  // it exits instead — the peer it was relaying to keeps waiting, untouched.
  detach(): void {
    if (this.relay) { this.shutdown(0); return; }
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
    if (this.transcript) return;
    const source = createTranscriptSource(harness, this.workspaceDir ?? this.root, Date.now());
    if (!source) return;
    this.transcript = source;
    this.transcriptTimer = setInterval(() => {
      const blocks = source.poll();
      if (blocks.length > 0) this.emit({ type: 'transcript', blocks });
    }, TRANSCRIPT_POLL_MS);
    this.transcriptTimer.unref();
  }
}

// Registration is injectable so the signal wiring can be exercised without raising real signals.
export function wireShutdown(
  server: RemoteServer,
  on: (signal: string, handler: () => void) => void = (signal, handler) => { process.on(signal as NodeJS.Signals, handler); },
): void {
  for (const signal of CHANNEL_SIGNALS) on(signal, () => {
    // The lost-transport signal parks the session; the two that mean someone ended this process end
    // it. See `CHANNEL_SIGNALS` above for why those stopped being the same answer.
    if (signal === 'SIGHUP') server.detach();
    else server.shutdown(0);
  });
}

export function runRemoteServer(pathArgument: string | undefined): void {
  const resolved = resolveRemoteRoot(pathArgument);
  if ('error' in resolved) {
    writeFrame({ type: 'workspace-failed', message: resolved.error });
    process.exit(1);
  }
  loadConfig(resolved.root);
  loadProjectTokens(resolved.root);
  loadGitIdentity(resolved.root);
  initWorkspaceDir(resolved.root);
  // Raw mode so the remote tty's line discipline neither echoes the framed input nor rewrites it.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  new RemoteServer(resolved.root).listen();
}
