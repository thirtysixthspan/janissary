import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell.js';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import type { ProjectTokens } from '../project-tokens.js';
import type { ClientFrame, ServerFrame } from './protocol.js';

// The remote server's process table. Every remote harness tab, every remote agent tab's persistent
// shell, every PTY takeover, and every inline terminal card is one entry here — there is no second
// frame family, so there is no second table either.
//
// `pty` mode runs the program in a pseudo-terminal, exactly as the local server does. `pipe` mode
// runs an agent tab's persistent shell with plain pipes: that shell's protocol is sentinel-delimited
// text, and a tty's echo would feed each written command straight back into the reader's buffer and
// match the sentinel before the command had run.
type Entry = { kill: () => void };

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
    this.entries.set(frame.id, entry);
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

  private spawnPty(frame: Extract<ClientFrame, { type: 'spawn' }>): Entry {
    // The remote builds its own copy of the harness environment, browser included: the endpoint
    // names ports on this host, so it could not have been computed on the other side and shipped
    // over. Because it needs no await, the caller's synchronous insert into `entries` is untouched
    // and there is no kill-before-spawn race to guard.
    const spawnEnv = frame.harness === undefined
      ? { env: undefined, handle: undefined }
      : harnessSpawnEnv({
        name: frame.harness, cwd: this.workspaceDir, label: this.label, browser: frame.browser ?? false,
        onBrowserGone: () => this.send({ type: 'browser-exited', id: frame.id }),
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

  private spawnPipe(id: string, agentName?: string): Entry {
    const shell = spawnShell(0, { JANUS_AGENT_NAME: agentName ?? this.label }, {
      workspaceDir: this.workspaceDir,
      tokens: this.tokens,
    });
    const onChunk = (chunk: string) => this.send({ type: 'output', id, data: chunk });
    shell.stdout?.on('data', onChunk);
    shell.stderr?.on('data', onChunk);
    shell.on('exit', (code) => this.finish(id, code ?? 0));
    // The shell inherits this server's own directory, so put it in the workspace the same way the
    // local `ShellManager` does for a freshly spawned shell.
    shell.stdin?.write(`cd "${this.workspaceDir}"\n`);
    this.writers.set(id, (data) => { if (shell.stdin?.writable) shell.stdin.write(data); });
    return { kill: () => { shell.kill(); } };
  }

  private finish(id: string, exitCode: number): void {
    this.entries.delete(id);
    this.writers.delete(id);
    this.resizers.delete(id);
    this.closeBrowser(id);
    this.send({ type: 'exit', id, exitCode });
  }
}
