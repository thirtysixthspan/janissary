import { spawnPty } from '../pty.js';
import { killShellGroup, spawnShell } from '../shell/index.js';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import type { ProjectTokens } from '../project/tokens.js';
import type { ClientFrame, RemoteProcessState, ServerFrame } from './protocol.js';

// The remote server's process table. Every remote harness tab, every remote agent tab's persistent
// shell, every PTY takeover, and every inline terminal card is one entry here — there is no second
// frame family, so there is no second table either.
//
// `pty` mode runs the program in a pseudo-terminal, exactly as the local server does. `pipe` mode
// runs an agent tab's persistent shell with plain pipes: that shell's protocol is sentinel-delimited
// text, and a tty's echo would feed each written command straight back into the reader's buffer and
// match the sentinel before the command had run.
//
// The spawn frame is kept beside the kill so the table can describe itself. A reattaching janissary
// knows what it once started but not what survived, and only this side does — so `states()` reads
// the entries that are still here, which is the same fact `kill` and `finish` maintain rather than a
// second record that could disagree with them.
type Entry = { kill: () => void; frame: Extract<ClientFrame, { type: 'spawn' }> };

// The e2e browser a `-b` spawn started on this host, if any. Closing it stops the guard, kills the
// confined Chromium, and removes the browser's scratch workspace — so a harness that exits on its
// own leaves nothing running, exactly as a killed one does.
type BrowserHandle = { close: () => void } | undefined;

export class RemoteProcesses {
  private entries = new Map<string, Entry>();

  constructor(
    private send: (frame: ServerFrame) => void,
    private workspaceDir: string,
    private label: string,
    private tokens: ProjectTokens = {},
  ) {}

  spawn(frame: Extract<ClientFrame, { type: 'spawn' }>): void {
    if (this.entries.has(frame.id)) return;
    const entry = frame.mode === 'pipe' ? this.spawnPipe(frame.id, frame.agentName) : this.spawnPty(frame);
    this.entries.set(frame.id, { ...entry, frame });
  }

  // One entry per process still running, in spawn order. An exited process has already been removed
  // by `finish`, so an empty list means the workspace is holding nothing.
  states(): RemoteProcessState[] {
    return [...this.entries.values()].map(({ frame }) => ({
      id: frame.id,
      program: frame.program,
      mode: frame.mode,
      ...(frame.harness !== undefined && { harness: frame.harness }),
      ...(frame.agentName !== undefined && { agentName: frame.agentName }),
    }));
  }

  input(id: string, data: string): void { this.writers.get(id)?.(data); }

  resize(id: string, cols: number, rows: number): void { this.resizers.get(id)?.(cols, rows); }

  kill(id: string): void { this.entries.get(id)?.kill(); }

  killAll(): void {
    for (const [, entry] of this.entries) entry.kill();
    this.entries.clear();
  }

  private writers = new Map<string, (data: string) => void>();
  private resizers = new Map<string, (cols: number, rows: number) => void>();

  private spawnPty(frame: Extract<ClientFrame, { type: 'spawn' }>): Omit<Entry, 'frame'> {
    // The remote builds its own copy of the harness environment, browser included: the endpoint
    // names ports on this host, so it could not have been computed on the other side and shipped
    // over. Because it needs no await, the caller's synchronous insert into `entries` is untouched
    // and there is no kill-before-spawn race to guard.
    const spawnEnv = frame.harness === undefined
      ? { env: undefined, handle: undefined }
      : harnessSpawnEnv({
        name: frame.harness, cwd: this.workspaceDir, label: this.label, browser: frame.browser ?? false,
        // The message travels with the frame: only this host saw the browser's own output, and the
        // tab that needs it is on the other side of the ssh transport.
        onBrowserGone: (message) => this.send({ type: 'browser-exited', id: frame.id, message }),
      });
    this.browsers.set(frame.id, spawnEnv.handle);
    // A throw here leaves before `spawn` records the entry, so neither `kill` nor `finish` will ever
    // reach the browser recorded a line above. Give it back here or nothing will.
    let session;
    try {
      session = spawnPty(
        frame.program,
        frame.command,
        this.workspaceDir,
        {
          onData: (_id, data) => this.send({ type: 'output', id: frame.id, data }),
          onExit: (_id, exitCode) => this.finish(frame.id, exitCode),
        },
        frame.cols,
        frame.rows,
        { workspaceDir: this.workspaceDir, offline: frame.offline, tokens: this.tokens },
        spawnEnv.env,
      );
    } catch (error) {
      this.closeBrowser(frame.id);
      throw error;
    }
    this.writers.set(frame.id, (data) => session.write(data));
    this.resizers.set(frame.id, (cols, rows) => session.resize(cols, rows));
    return { kill: () => { this.closeBrowser(frame.id); session.kill(); } };
  }

  private browsers = new Map<string, BrowserHandle>();

  private closeBrowser(id: string): void {
    this.browsers.get(id)?.close();
    this.browsers.delete(id);
  }

  // Spawned in a process group of its own, because the hangup that parks this peer is delivered to
  // the ssh session's group and would otherwise take the shell down with the transport — the one
  // thing a detach exists to leave running. A `pty` process needs no such care: its pseudo-terminal
  // already put it in a session of its own.
  private spawnPipe(id: string, agentName?: string): Omit<Entry, 'frame'> {
    const shell = spawnShell(0, { JANUS_AGENT_NAME: agentName ?? this.label }, {
      workspaceDir: this.workspaceDir,
      tokens: this.tokens,
    }, { detached: true });
    const onChunk = (chunk: string) => this.send({ type: 'output', id, data: chunk });
    shell.stdout?.on('data', onChunk);
    shell.stderr?.on('data', onChunk);
    shell.on('exit', (code) => this.finish(id, code ?? 0));
    // The shell inherits this server's own directory, so put it in the workspace the same way the
    // local `ShellManager` does for a freshly spawned shell.
    shell.stdin?.write(`cd "${this.workspaceDir}"\n`);
    this.writers.set(id, (data) => { if (shell.stdin?.writable) shell.stdin.write(data); });
    return { kill: () => { killShellGroup(shell); } };
  }

  private finish(id: string, exitCode: number): void {
    this.entries.delete(id);
    this.writers.delete(id);
    this.resizers.delete(id);
    this.closeBrowser(id);
    this.send({ type: 'exit', id, exitCode });
  }
}
