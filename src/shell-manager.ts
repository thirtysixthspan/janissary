import type { ChildProcess } from 'node:child_process';
import { spawnShell, executeShellCmd as executeShellCommand, queryShellPwd } from './shell.js';

// The base name of the user's login shell (`bash`, `zsh`, …), used both to launch tab shells and to
// label the `shell:<name>` connection in the panel/completion.
export const SHELL_NAME = (process.env.SHELL || 'bash').split('/').pop() || 'bash';

// Callbacks for a single `run`: `onChunk` streams partial output as it arrives, `onDone` receives the
// final captured output, and `onPwd` the shell's working directory after the command (so the caller
// can keep its own cwd tracking in sync). `onPwd` fires only when the query returns a non-empty path.
type RunHandlers = {
  onChunk: (buffer: string) => void;
  onDone: (result: string) => void;
  onPwd: (pwd: string) => void;
};

// Owns the per-tab persistent shells. Each tab (keyed by its label) gets one long-lived shell process
// that preserves working directory and environment across commands; the manager spawns them lazily,
// runs commands with streaming output, and tears them down. Working directory tracking stays with the
// caller — the manager only reports the shell's pwd back after each command via `onPwd`.
export class ShellManager {
  private shells = new Map<string, ChildProcess>();

  // Whether a tab currently has a live shell. Drives the connections panel and completion.
  has(label: string): boolean {
    return this.shells.has(label);
  }

  // The tab's persistent shell, spawned on first use and respawned if the previous one died (its
  // stdin no longer writable). A freshly spawned shell is `cd`'d into `cwd` so it starts in the tab's
  // working directory — the workspace clone for a workspaced agent, or the saved cwd for a
  // `--relaunch`'d tab. A nullish `cwd` leaves the shell in its default directory.
  private getShell(label: string, cwd: string | undefined): ChildProcess {
    let shell = this.shells.get(label);
    if (!shell || !shell.stdin?.writable) {
      shell = spawnShell(0, { JANUS_AGENT_NAME: label });
      this.shells.set(label, shell);
      if (cwd) shell.stdin!.write(`cd "${cwd}"\n`);
    }
    return shell;
  }

  // Run a command in the tab's persistent shell, spawning it if needed. `index` tags the streamed
  // output (and the pwd query) so concurrent tabs don't cross sentinels. After the command completes
  // the shell's pwd is queried and reported via `onPwd`.
  run(label: string, command: string, index: number, cwd: string | undefined, handlers: RunHandlers): void {
    const shell = this.getShell(label, cwd);
    executeShellCommand(shell, command, index, handlers.onChunk, (result) => {
      handlers.onDone(result);
      queryShellPwd(shell, index, (pwd) => { if (pwd) handlers.onPwd(pwd); });
    });
  }

  // Kill and forget a tab's shell. Returns whether a shell was actually open (drives the
  // `connection close shell` result message). On `connection close shell` and tab close.
  close(label: string): boolean {
    const shell = this.shells.get(label);
    if (!shell) return false;
    shell.kill();
    this.shells.delete(label);
    return true;
  }

  // Kill every shell (app shutdown).
  closeAll(): void {
    for (const [, shell] of this.shells) shell.kill();
    this.shells.clear();
  }
}
