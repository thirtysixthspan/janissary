import path from 'node:path';
import { spawnPty } from '../pty.js';
import { shellStartupEnvironment } from '../shell/zsh-startup/script.js';
import { ZshStartupDirectory } from '../shell/zsh-startup/directory.js';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import { messageBus } from '../bus.js';
import { containedAbsolute } from '../path-containment.js';
import type { ScreenCapture } from '../harness/screen.js';
import { buildHarnessDetection, type HarnessDetection } from './serve-processes-detect.js';
import { spawnFrameState } from './process-state.js';
import { FarSideMcp } from './serve-mcp.js';
import { PendingSpawns } from './serve-pending-spawns.js';
import { spawnPipeProcess } from './serve-pipe-process.js';
import type { McpLaunch } from '../mcp/manager.js';
import type { ProjectTokens } from '../project/tokens.js';
import type { ClientFrame, RemoteProcessState, ServerFrame } from './protocol-frames.js';

// The remote server's process table. Every remote harness tab, every remote tab's persistent
// shell, every PTY takeover, and every inline terminal card is one entry here — there is no second
// frame family, so there is no second table either.
//
// `pty` mode runs the program in a pseudo-terminal, exactly as the local server does. `pipe` mode
// runs a shell tab's persistent shell with plain pipes: that shell's protocol is sentinel-delimited
// text, and a tty's echo would feed each written command straight back into the reader's buffer and
// match the sentinel before the command had run.
//
// The spawn frame is kept beside the kill so the table can describe itself. An attaching janissary
// knows what it once started but not what survived, and only this side does — so `states()` reads
// the entries that are still here, which is the same fact `kill` and `finish` maintain rather than a
// second record that could disagree with them.
type ProcessResources = {
  kill: () => void;
  writer: (data: string) => void;
  resizer?: (cols: number, rows: number) => void;
  detection?: HarnessDetection;
  browser?: BrowserHandle;
};
type SpawnFrame = Extract<ClientFrame, { type: 'spawn' }>;
type Entry = ProcessResources & { frame: SpawnFrame };

// The e2e browser a `-b` spawn started on this host, if any. Closing it stops the guard, kills the
// confined Chromium, and removes the browser's scratch workspace — so a harness that exits on its
// own leaves nothing running, exactly as a killed one does.
type BrowserHandle = { close: () => void } | undefined;

type McpResultFrame = Extract<ClientFrame, { type: 'mcp-result' }>;

export class RemoteProcesses {
  private entries = new Map<string, Entry>();
  private zshStartup = new ZshStartupDirectory();
  private mcp?: FarSideMcp;
  private pending = new PendingSpawns();

  constructor(
    private send: (frame: ServerFrame) => void,
    private workspaceDir: string,
    private label: string,
    private tokens: ProjectTokens = {},
    private linked: () => boolean = () => true,
  ) {}

  spawn(frame: SpawnFrame): Promise<void> | undefined {
    if (this.entries.has(frame.id) || this.pending.has(frame.id)) return;
    if (frame.mode === 'pipe') {
      const pipe = spawnPipeProcess(frame.id, {
        workspaceDir: this.workspaceDir, tokens: this.tokens, name: frame.agentName ?? this.label,
        send: this.send, finish: (exitCode) => this.finish(frame.id, exitCode),
      });
      this.entries.set(frame.id, { ...pipe, frame });
      return;
    }
    if (frame.mcp !== true) {
      this.entries.set(frame.id, { ...this.spawnPty(frame), frame });
      return;
    }
    const endpoint = this.mcp ??= new FarSideMcp((out) => {
      if (out.type === 'mcp-cancel' || this.linked()) return this.send(out);
      return false;
    }, frame.id, () => this.linked());
    this.pending.begin(frame.id);
    return this.spawnWithMcp(frame, endpoint);
  }

  // A kill or `killAll` that arrived while the bind was awaited cancels the spawn, which rejects so
  // the caller answers it as that process's exit; a disposed or replaced endpoint does the same.
  private async spawnWithMcp(frame: SpawnFrame, endpoint: FarSideMcp): Promise<void> {
    let mcp: McpLaunch;
    try {
      mcp = await endpoint.launch(frame.id);
    } catch (error) {
      this.pending.end(frame.id);
      throw error;
    }
    const held = this.pending.end(frame.id);
    if (held === undefined || this.mcp !== endpoint) throw new Error(`Spawn ${frame.id} was cancelled before it started.`);
    this.entries.set(frame.id, { ...this.spawnPty(frame, mcp), frame });
    if (held.size !== undefined) this.resize(frame.id, held.size.cols, held.size.rows);
    for (const data of held.input) this.input(frame.id, data);
  }

  // One entry per process still running, in spawn order. An exited process has already been removed
  // by `finish`, so an empty list means the workspace is holding nothing.
  states(): RemoteProcessState[] {
    return [...this.entries.values()].map(({ frame }) => spawnFrameState(frame));
  }

  input(id: string, data: string): void {
    if (this.pending.input(id, data)) return;
    this.entries.get(id)?.writer(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (this.pending.resize(id, cols, rows)) return;
    this.entries.get(id)?.resizer?.(cols, rows);
    messageBus.emit('pty', { type: 'resize', id, cols, rows });
  }

  kill(id: string): void {
    if (this.pending.cancel(id)) return;
    this.entries.get(id)?.kill();
  }

  // The latest screen capture for a harness process's detection pipeline, or undefined when it has
  // none yet (no bytes settled) or `id` names a process with no detection at all (not a harness, or
  // already exited). Backs `capture-request` (decision 15/16 of the auto-accept-while-detached plan):
  // a fresh on-demand snapshot, live or from a parked peer, without a full attach.
  latestCapture(id: string): ScreenCapture | undefined { return this.entries.get(id)?.detection?.latestCapture(); }

  // Every harness process's current busy/ready state, for `DetachedPeer.accept()` to send as a
  // one-shot `busy-transition` on attach (decision 20 of the auto-accept-while-detached plan).
  busyStates(): Array<{ id: string; busy: boolean; unread: boolean }> {
    return [...this.entries].flatMap(([id, entry]) => entry.detection === undefined ? [] : [{ id, ...entry.detection.snapshot() }]);
  }

  // The client's answer to a `resume-event` it has already acted on: the scheduled resume left that
  // process's tab schedule, delivered or cancelled, so this side's detector may report a fresh limit.
  // An id with no detection — a plain PTY, an agent process, or one already exited — is ignored.
  resumeDelivered(id: string): void { this.entries.get(id)?.detection?.delivered(); }

  mcpResult(frame: McpResultFrame): void { this.mcp?.result(frame); }

  killAll(): void {
    this.pending.cancelAll();
    for (const entry of this.entries.values()) {
      entry.kill();
      this.disposeResources(entry);
    }
    this.entries.clear();
    this.mcp?.dispose();
    this.mcp = undefined;
    this.zshStartup.dispose();
  }

  private spawnPty(frame: SpawnFrame, mcp?: McpLaunch): ProcessResources {
    const shell = frame.shell;
    const cwd = shell === undefined ? this.workspaceDir : this.shellCwd(frame.cwd);
    // The remote builds its own copy of the harness environment, browser and MCP endpoint included:
    // both name ports and mints tokens on this host, so neither could have been computed on the other
    // side and shipped over. `spawn` awaits the endpoint bind first, so the URL placed here is one
    // this host actually bound. Frames for this id that arrived during that wait were held by
    // `PendingSpawns`: a kill or `killAll` cancelled the spawn before it got here, and input and the
    // latest resize are replayed once the entry exists.
    const spawnEnv = frame.harness === undefined
      ? { env: undefined, handle: undefined }
      : harnessSpawnEnv({
        name: frame.harness, cwd: this.workspaceDir, label: this.label, browser: frame.browser ?? false,
        mcp,
        // The message travels with the frame: only this host saw the browser's own output, and the
        // tab that needs it is on the other side of the ssh transport.
        onBrowserGone: (message) => this.send({ type: 'browser-exited', id: frame.id, message }),
        onBrowserStarted: () => this.send({ type: 'browser-started', id: frame.id }),
      });
    let browserHandle = spawnEnv.handle;
    const browser: BrowserHandle = browserHandle === undefined ? undefined : {
      close: () => {
        const handle = browserHandle;
        browserHandle = undefined;
        handle?.close();
      },
    };
    // A throw here leaves before `spawn` records the entry, so neither `kill` nor `finish` will ever
    // reach the browser recorded a line above. Give it back here or nothing will.
    let session;
    try {
      // What this host publishes wins over overrides shipped in the frame: a local value naming a
      // port or a token on this machine would point the harness somewhere it must not reach.
      const extraEnv = shell === undefined
        ? (spawnEnv.env === undefined ? frame.env : { ...frame.env, ...spawnEnv.env })
        : {
          ...frame.env,
          ...spawnEnv.env,
          ...shellStartupEnvironment(this.zshStartup.path(), shell.nonce, frame.env?.ZDOTDIR ?? process.env.ZDOTDIR),
        };
      session = spawnPty(
        frame.program,
        frame.command,
        cwd,
        {
          onData: (_id, data) => {
            this.send({ type: 'output', id: frame.id, data });
            messageBus.emit('pty', { type: 'data', id: frame.id, data });
          },
          onExit: (_id, exitCode) => {
            messageBus.emit('pty', { type: 'exit', id: frame.id, exitCode });
            this.finish(frame.id, exitCode);
          },
        },
        frame.cols,
        frame.rows,
        { workspaceDir: this.workspaceDir, offline: frame.offline, tokens: this.tokens },
        extraEnv,
        frame.launch ?? (shell === undefined ? undefined : { shell: 'zsh', args: [] }),
      );
    } catch (error) {
      browser?.close();
      throw error;
    }
    const resources: ProcessResources = {
      kill: () => { browser?.close(); session.kill(); },
      writer: (data) => session.write(data),
      resizer: (cols, rows) => session.resize(cols, rows),
      browser,
    };
    if (frame.harness !== undefined) {
      resources.detection = buildHarnessDetection(
        frame.id, frame.harness, frame.cols, frame.rows, frame.autoApprove ?? false, frame.autoResume ?? false,
        (keystroke) => this.input(frame.id, keystroke), this.send,
      );
    }
    return resources;
  }

  private shellCwd(requested: string | undefined): string {
    const cwd = path.resolve(this.workspaceDir, requested ?? '.');
    return containedAbsolute(this.workspaceDir, cwd) ? cwd : this.workspaceDir;
  }

  private disposeResources(entry: Entry): void {
    entry.detection?.dispose();
    entry.detection = undefined;
    entry.browser?.close();
    entry.browser = undefined;
  }

  private finish(id: string, exitCode: number): void {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    if (entry !== undefined) this.disposeResources(entry);
    this.send({ type: 'exit', id, exitCode });
  }
}
