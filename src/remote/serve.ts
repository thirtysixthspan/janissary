import { loadConfig } from '../config.js';
import { getGithubToken, loadGithubToken } from '../github-token.js';
import { getClaudeToken, loadClaudeToken } from '../claude-token.js';
import { getOpencodeToken, loadOpencodeToken } from '../opencode-token.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { sandboxNotice } from '../sandbox/index.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { createTranscriptSource } from '../harness/transcript/sources.js';
import type { TranscriptSource } from '../harness/transcript/source.js';
import { decodeFrame, encodeFrame, encodeHandshake, type ClientFrame, type ServerFrame } from './protocol.js';
import { resolveRemoteRoot } from './serve-root.js';
import { RemoteProcesses } from './serve-processes.js';
import { githubTokenNotice, workspaceReadyNotice } from './serve-notice.js';

// `janus remote-serve [<project-dir>]`: the far end of a remote janissary session. It runs attached
// inside an ordinary ssh session, takes no instance lock, starts no HTTP server, opens no window,
// and writes nothing to `.janissary/log/`. Its capability surface is deliberately closed — it will
// not open tabs, serve files, run anything outside the workspace it provisions, or accept a frame
// outside the union.

// How often the harness's own session record is re-read and pushed, matching the local tailer's
// cadence (`src/harness/transcript/tailer.ts`).
const TRANSCRIPT_POLL_MS = 2000;

// SIGHUP is what arrives when the ssh channel drops; the other two cover an ordinary kill. All three
// mean the same thing here: the session this process exists to serve is over, so its workspace clone
// goes with it and no clone is ever left behind.
export const CHANNEL_SIGNALS = ['SIGHUP', 'SIGTERM', 'SIGINT'] as const;

function writeFrame(frame: ServerFrame): void {
  process.stdout.write(`${encodeFrame(frame)}\n`);
}

export class RemoteServer {
  private workspaces: WorkspaceManager;
  private processes: RemoteProcesses | undefined;
  private workspaceDir: string | undefined;
  private transcript: TranscriptSource | undefined;
  private transcriptTimer: NodeJS.Timeout | undefined;
  private buffer = '';
  private stopping = false;

  constructor(
    private root: string,
    private emit: (frame: ServerFrame) => void = writeFrame,
    private exit: (code: number) => void = (code) => process.exit(code),
  ) {
    this.workspaces = new WorkspaceManager(root);
  }

  listen(): void {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { this.receive(chunk); });
    process.stdin.on('end', () => { this.shutdown(0); });
    wireShutdown(this);
    process.stdin.resume();
  }

  // Everything the local side wrote, in arrival order. Newline-delimited, so a frame split across
  // two reads is buffered until it is complete.
  receive(chunk: string): void {
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
    if (this.transcriptTimer) clearInterval(this.transcriptTimer);
    this.processes?.killAll();
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
    if ('error' in frame) { this.refuse(frame.error); return; }
    switch (frame.type) {
    case 'provision': {
      void this.provision(frame.label, frame.githubToken, frame.claudeToken, frame.opencodeToken);
      return;
    }
    case 'spawn': { this.spawn(frame); return; }
    case 'input': { this.processes?.input(frame.id, frame.data); return; }
    case 'resize': { this.processes?.resize(frame.id, frame.cols, frame.rows); return; }
    case 'kill': { this.processes?.kill(frame.id); return; }
    default: { this.refuse(`Unexpected remote frame "${frame.type}".`); }
    }
  }

  // Clone the project root's `origin` into `.janissary/workspace/<label>` under this root, using the
  // very same `WorkspaceManager` the local server uses for a `-w` launch.
  private async provision(
    label: string,
    forwardedGithubToken?: string,
    forwardedClaudeToken?: string,
    forwardedOpencodeToken?: string,
  ): Promise<void> {
    const result = this.workspaces.create(label);
    if ('error' in result) { this.refuse(result.error); return; }
    try {
      await result.ready;
    } catch (error) {
      this.refuse(error instanceof Error ? error.message : String(error));
      return;
    }
    this.workspaceDir = result.dir;
    const ownGithubToken = getGithubToken();
    // No notice for either harness token, unlike the GitHub one: a missing harness credential
    // announces itself in that harness's own output the moment it starts, and most remote launches
    // have none configured on either machine and are working as intended, so a mirrored notice would
    // speak on the ordinary case rather than warn about anything.
    this.processes = new RemoteProcesses(
      (frame) => this.emit(frame),
      result.dir,
      label,
      {
        github: forwardedGithubToken ?? ownGithubToken,
        claude: forwardedClaudeToken ?? getClaudeToken(),
        opencode: forwardedOpencodeToken ?? getOpencodeToken(),
      },
    );
    this.emit({
      type: 'workspace-ready',
      dir: result.dir,
      notice: workspaceReadyNotice(sandboxNotice(), githubTokenNotice(forwardedGithubToken, ownGithubToken)),
    });
  }

  private spawn(frame: Extract<ClientFrame, { type: 'spawn' }>): void {
    if (!this.processes) { this.refuse('No remote workspace has been provisioned.'); return; }
    this.processes.spawn(frame);
    if (frame.harness !== undefined) this.followTranscript(frame.harness);
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
  for (const signal of CHANNEL_SIGNALS) on(signal, () => { server.shutdown(0); });
}

export function runRemoteServer(pathArgument: string | undefined): void {
  const resolved = resolveRemoteRoot(pathArgument);
  if ('error' in resolved) {
    writeFrame({ type: 'workspace-failed', message: resolved.error });
    process.exit(1);
  }
  loadConfig(resolved.root);
  loadGithubToken(resolved.root);
  loadClaudeToken(resolved.root);
  loadOpencodeToken(resolved.root);
  initWorkspaceDir(resolved.root);
  // Raw mode so the remote tty's line discipline neither echoes the framed input nor rewrites it.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdout.write(`${encodeHandshake(resolved.root)}\n`);
  new RemoteServer(resolved.root).listen();
}
