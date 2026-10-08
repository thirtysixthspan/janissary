import { statSync } from 'node:fs';
import { spawnShell, executeShellCmd as executeShellCommand, queryShellPwd, type ShellProcess } from './index.js';
import { createRemoteShell } from '../remote/shell-session.js';
import { getProjectTokens } from '../project/tokens.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// The base name of the user's login shell (`bash`, `zsh`, …), used both to launch tab shells and to
// label the `shell:<name>` connection in the panel/completion.
export const SHELL_NAME = (process.env.SHELL || 'bash').split('/').pop() || 'bash';

// The bare name of a shell binary, which is what a connection row and a program label show. A caller
// naming a full path gets its basename, so a plugin that asks for `/bin/zsh` is listed as `zsh`
// beside every other shell in the application.
export function shellName(shellPath: string): string {
  return shellPath.split('/').pop() || SHELL_NAME;
}

// A local shell started in a recorded cwd that is not a directory — deleted since, or never a path —
// exits at once, and so would every respawn after it; it starts in the project directory instead.
function existingDirectory(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  try { return statSync(dir).isDirectory() ? dir : undefined; } catch { return undefined; }
}

// Callbacks for a single `execute`: `onChunk` streams partial output as it arrives, `onDone` receives
// the final captured output, and `onPwd` the shell's working directory after the command (so the
// caller can keep its own cwd tracking in sync). `onPwd` fires only when the query returns a non-empty
// path.
type RunHandlers = {
  onChunk: (buffer: string) => void;
  onDone: (result: string) => void;
  onPwd: (pwd: string) => void;
};

// Owns the per-tab persistent shells. Each tab (keyed by its label) gets one long-lived shell process
// that preserves working directory and environment across commands; the manager spawns them lazily,
// runs commands with streaming output, and tears them down.
export class ShellManager {
  private shells = new Map<string, ShellProcess>();
  // Distinguishes a remote tab's shell ids from the local `pty…` ids, so both can key the same
  // remote channel without colliding.
  private remoteShellCounter = 0;
  // Spawn ids an attach recorded for tabs whose shells have not been asked for yet. A remote agent
  // tab's shell is created lazily, on its first command, so the id cannot be handed to a constructor
  // — it waits here until `spawnFor` needs one, and is consumed exactly once. The session id the
  // record carried is kept beside the spawn id so an adoption can never be claimed by a tab talking
  // over a different channel: the label a tab holds is freed the moment it closes, and a later tab
  // granted the same label must start its own shell rather than bind to a process on a session that
  // has nothing to do with it.
  // Serializes each tab's shell interactions (a command's execution, then its trailing pwd query)
  // so at most one stdin write / stdout listener pair is ever live on a given shell at a time.
  // Without this, a rapid-fire queued command (dispatched the instant the previous one goes idle)
  // could attach its own listener while the previous command's still-in-flight pwd query is
  // waiting on the same stdout stream — Node delivers that chunk to both listeners, leaking the
  // pwd query's cwd line and its `__PWD_...__` marker into the next command's output.
  private shellQueues = new Map<string, Promise<void>>();
  // Shells this manager killed itself, and what becomes of the command each was running. Killing ends
  // a shell's streams, which completes that command. A tab close or shutdown kills `silent`ly: the
  // completion is dropped, because the tab it would report to may already be gone. `connection close
  // shell` kills with `report`: its tab stays open, so the command finishes as if the shell had exited
  // on its own — only the pwd query is skipped, there being no shell left to answer it.
  private retired = new WeakMap<ShellProcess, 'silent' | 'report'>();

  constructor(private managers: Managers) {}

  // Whether a tab currently has a live shell. Drives the connections panel and completion.
  has(label: string): boolean {
    return this.shells.has(label);
  }

  // The tab's persistent shell, spawned on first use and respawned if the previous one died (its
  // stdin no longer writable). A freshly spawned shell is `cd`'d into `cwd` so it starts in the tab's
  // working directory — the workspace clone for a workspaced agent. A nullish `cwd` leaves the shell
  // in its default directory.
  private getShell(label: string, cwd: string | undefined): ShellProcess {
    const existing = this.shells.get(label);
    if (existing?.stdin?.writable) return existing;
    const shell = this.spawnFor(label, cwd);
    this.shells.set(label, shell);
    this.shellQueues.delete(label);
    return shell;
  }

  // A remote tab's shell is just another remote process: the channel spawns the login shell in the
  // remote workspace and the adapter wears the shape `executeShellCmd` already consumes. No `cd`
  // is written for it — the remote server has already started it in the workspace — and no local
  // sandbox options apply, since the confinement decision belongs to the machine it runs on.
  //
  // Shared captured execution uses pipes; interactive shells own their separate plugin terminals.
  private spawnFor(label: string, cwd: string | undefined): ShellProcess {
    const tab = this.managers.tab.byLabel(label);
    const channel = tab?.remote ? this.managers.remote.get(label) : undefined;
    if (channel) {
      return createRemoteShell(channel, `rsh${++this.remoteShellCounter}`, SHELL_NAME, SHELL_NAME, label);
    }
    const sandbox = {
      workspaceDir: tab?.workspaceDir,
      offline: tab?.offline,
      tokens: tab?.workspaceDir ? getProjectTokens() : undefined,
    };
    const localCwd = cwd ? existingDirectory(cwd) ?? existingDirectory(this.managers.tab.launchDir) : undefined;
    const shell = spawnShell(0, { JANUS_AGENT_NAME: label }, sandbox);
    if (localCwd) shell.stdin?.write(`cd "${localCwd}"\n`);
    return shell;
  }

  // Run a command with transcript streaming, busy state, and persistence. This is the high-level
  // entry point for shell execution: it creates a running transcript entry, streams output as it
  // arrives, finalizes the entry on completion, and persists the tab. Accepts an optional callback
  // for when the full output is captured.
  run(label: string, command: string, options?: { onComplete?: (out: string) => void }): void {
    const index = Math.max(0, this.managers.tab.findIndex(label));
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    if (!this.managers.tab.byLabel(label)) { options?.onComplete?.(''); return; }

    this.managers.tab.startRunning(label, command, { cwd });

    const update = (output: string, running: boolean, trailing = false) => {
      this.managers.tab.updateRunning(label, { command }, output, running, {
        trailing,
        finalize: () => {
          this.managers.tab.deleteBusy(label);
        },
        markUnread: (l) => this.managers.tab.markUnread(l),
      });
    };


    this.execute(label, command, index, this.managers.tab.cwdOf(label), {
      onChunk: (buffer) => { update(buffer, true); },
      onDone: (result) => {
        update(result, false, true);
        options?.onComplete?.(result);
      },
      onPwd: (pwd) => { this.managers.tab.setCwd(label, pwd); messageBus.emit('state', { type: 'dirty' }); },
    });
  }

  // Low-level: run a command in the tab's persistent shell, spawning it if needed. `index` tags the
  // streamed output so concurrent tabs don't cross sentinels. After the command completes the shell's
  // pwd is queried and reported via `onPwd`. Chained onto `shellQueues` so this command's stdin
  // write/listener pair never overlaps a still-in-flight pwd query from the previous command on
  // the same shell (see `shellQueues`' comment).
  private execute(label: string, command: string, index: number, cwd: string | undefined, handlers: RunHandlers): void {
    const shell = this.getShell(label, cwd);
    const previous = this.shellQueues.get(label) ?? Promise.resolve();
    const next = (async () => {
      await previous;
      await new Promise<void>((resolve) => {
        executeShellCommand(shell, command, index, handlers.onChunk, (result) => {
          const retired = this.retired.get(shell);
          if (retired === 'silent') { resolve(); return; }
          handlers.onDone(result);
          if (retired) { resolve(); return; }
          queryShellPwd(shell, index, (pwd) => {
            if (pwd) handlers.onPwd(pwd);
            resolve();
          });
        });
      });
    })();
    this.shellQueues.set(label, next);
  }

  // Kill and forget a tab's shell on `connection close shell`. The tab stays open, so the command the
  // shell was running still finishes. Returns whether a shell was actually open (drives the result
  // message).
  close(label: string): boolean { return this.retire(label, 'report'); }

  closeTab(label: string): void { this.retire(label, 'silent'); }

  private retire(label: string, mode: 'silent' | 'report'): boolean {
    const shell = this.shells.get(label);
    if (!shell) return false;
    this.retired.set(shell, mode);
    shell.kill();
    this.shells.delete(label);
    this.shellQueues.delete(label);
    return true;
  }

  // Kill every shell (app shutdown).
  closeAll(): void {
    for (const [, shell] of this.shells) { this.retired.set(shell, 'silent'); shell.kill(); }
    this.shells.clear();
    this.shellQueues.clear();
  }

  dispose(): void {
    this.closeAll();
  }
}
