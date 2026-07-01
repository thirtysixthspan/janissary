import type { ChildProcess } from 'node:child_process';
import { spawnShell, executeShellCmd as executeShellCommand, queryShellPwd } from './shell.js';
import { getConfig } from './config.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

// The base name of the user's login shell (`bash`, `zsh`, …), used both to launch tab shells and to
// label the `shell:<name>` connection in the panel/completion.
export const SHELL_NAME = (process.env.SHELL || 'bash').split('/').pop() || 'bash';

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
  private shells = new Map<string, ChildProcess>();

  constructor(private managers: Managers) {}

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

  // Run a command with transcript streaming, busy state, and persistence. This is the high-level
  // entry point for shell execution: it creates a running transcript entry, streams output as it
  // arrives, finalizes the entry on completion, and persists the tab. Accepts an optional callback
  // for when the full output is captured.
  run(label: string, command: string, options?: { onComplete?: (out: string) => void }): void {
    const index = Math.max(0, this.managers.tab.findIndex(label));
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab) { options?.onComplete?.(''); return; }

    const before = tab.log.length;
    const max = getConfig().transcriptMaxLines;
    tab.log = [...tab.log, { input: command, output: '', running: true, cwd }];
    if (tab.log.length > max) tab.log = tab.log.slice(tab.log.length - max);
    const trimmed = before + 1 - tab.log.length;
    if (trimmed > 0) messageBus.emit('transcript', { type: 'entries:trimmed', tabLabel: label, count: trimmed });
    messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry: tab.log.at(-1)!, tab });

    this.managers.tab.addBusy(label);
    messageBus.emit('state', { type: 'dirty' });

    const update = (output: string, running: boolean) => {
      const t = this.managers.tab.tabs.find((x) => x.label === label);
      if (t) {
        const log = [...t.log];
        const index_ = log.findLastIndex((e) => e.input === command && e.running);
        if (index_ !== -1) log[index_] = { ...log[index_], output, running };
        t.log = log;
      }
      if (!running) { this.managers.tab.deleteBusy(label); this.managers.tab.persist(this.managers.tab.buildAgentState(tab)); }
      messageBus.emit('state', { type: 'dirty' });
    };

    this.execute(label, command, index, this.managers.tab.cwdOf(label), {
      onChunk: (buffer) => update(buffer, true),
      onDone: (result) => {
        update(result, false);
        if (result && tab) messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry: { input: '', output: result }, tab });
        options?.onComplete?.(result);
      },
      onPwd: (pwd) => { this.managers.tab.setCwd(label, pwd); messageBus.emit('state', { type: 'dirty' }); },
    });
  }

  // Low-level: run a command in the tab's persistent shell, spawning it if needed. `index` tags the
  // streamed output so concurrent tabs don't cross sentinels. After the command completes the shell's
  // pwd is queried and reported via `onPwd`.
  private execute(label: string, command: string, index: number, cwd: string | undefined, handlers: RunHandlers): void {
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
