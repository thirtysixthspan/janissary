import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell.js';
import { harnessEnv } from '../harness/scratch-dir.js';
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

export class RemoteProcesses {
  private entries = new Map<string, Entry>();

  constructor(
    private send: (frame: ServerFrame) => void,
    private workspaceDir: string,
    private label: string,
    private githubToken?: string,
  ) {}

  spawn(frame: Extract<ClientFrame, { type: 'spawn' }>): void {
    if (this.entries.has(frame.id)) return;
    const entry = frame.mode === 'pipe' ? this.spawnPipe(frame.id) : this.spawnPty(frame);
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
    const session = spawnPty(
      frame.program,
      frame.command,
      this.workspaceDir,
      {
        onData: (_id, data) => this.send({ type: 'output', id: frame.id, data }),
        onExit: (_id, exitCode) => this.finish(frame.id, exitCode),
      },
      frame.cols,
      frame.rows,
      { workspaceDir: this.workspaceDir, offline: frame.offline, githubToken: this.githubToken },
      frame.harness === undefined ? undefined : harnessEnv(frame.harness, this.workspaceDir),
    );
    this.writers.set(frame.id, (data) => session.write(data));
    this.resizers.set(frame.id, (cols, rows) => session.resize(cols, rows));
    return { kill: () => session.kill() };
  }

  private spawnPipe(id: string): Entry {
    const shell = spawnShell(0, { JANUS_AGENT_NAME: this.label }, {
      workspaceDir: this.workspaceDir,
      githubToken: this.githubToken,
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
    this.send({ type: 'exit', id, exitCode });
  }
}
