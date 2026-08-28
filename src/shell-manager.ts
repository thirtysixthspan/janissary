import { spawnShell, executeShellCmd as executeShellCommand, queryShellPwd, type ShellProcess } from './shell.js';
import { createRemoteShell } from './remote/shell-session.js';
import { createPtyShell, ptyShellArgs } from './shell-pty-session.js';
import { createShellPromotion, TERMINAL_ENTRY_NOTE, type ShellPromotion } from './shell-promotion.js';
import { getConfig } from './config.js';
import { getProjectTokens } from './project-tokens.js';
import { messageBus } from './bus.js';
import type { SandboxOptions } from './sandbox/index.js';
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
  private shells = new Map<string, ShellProcess>();
  // Distinguishes a remote tab's shell ids from the local `pty…` ids, so both can key the same
  // remote channel without colliding.
  private remoteShellCounter = 0;
  // Serializes each tab's shell interactions (a command's execution, then its trailing pwd query)
  // so at most one stdin write / stdout listener pair is ever live on a given shell at a time.
  // Without this, a rapid-fire queued command (dispatched the instant the previous one goes idle)
  // could attach its own listener while the previous command's still-in-flight pwd query is
  // waiting on the same stdout stream — Node delivers that chunk to both listeners, leaking the
  // pwd query's cwd line and its `__PWD_...__` marker into the next command's output.
  private shellQueues = new Map<string, Promise<void>>();
  // The pty id backing each tab's shell, for the promotion path to point `activePty` at. Absent for
  // a piped or remote shell, which is what makes those tabs unpromotable.
  private shellPtyIds = new Map<string, string>();
  // The promotion state of each tab's currently-running command, so the manual `open in terminal`
  // intent has something to act on.
  private promotions = new Map<string, ShellPromotion>();

  constructor(private managers: Managers) {}

  // Whether a tab currently has a live shell. Drives the connections panel and completion.
  has(label: string): boolean {
    return this.shells.has(label);
  }

  // The tab's persistent shell, spawned on first use and respawned if the previous one died (its
  // stdin no longer writable). A freshly spawned shell is `cd`'d into `cwd` so it starts in the tab's
  // working directory — the workspace clone for a workspaced agent, or the saved cwd for a
  // `--relaunch`'d tab. A nullish `cwd` leaves the shell in its default directory.
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
  // A local tab's shell runs inside a pty when `interactiveShellDetection` is on, so a program that
  // takes over the screen can be spotted and promoted mid-command; with it off, the shell is piped
  // exactly as before. Remote tabs stay piped either way.
  private spawnFor(label: string, cwd: string | undefined): ShellProcess {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    const channel = tab?.remote ? this.managers.remote.get(label) : undefined;
    if (channel) {
      return createRemoteShell(channel, `rsh${++this.remoteShellCounter}`, SHELL_NAME, SHELL_NAME);
    }
    const sandbox = {
      workspaceDir: tab?.workspaceDir,
      offline: tab?.offline,
      tokens: tab?.workspaceDir ? getProjectTokens() : undefined,
    };
    if (getConfig().interactiveShellDetection) return this.spawnPtyShellFor(label, cwd, sandbox);
    const shell = spawnShell(0, { JANUS_AGENT_NAME: label }, sandbox);
    if (cwd) shell.stdin?.write(`cd "${cwd}"\n`);
    return shell;
  }

  // The pty-backed variant: registered as a transport so the manager reaps it with the tab and never
  // lists it among the tab's `terminal:` connections, while its bytes come back here to be scraped
  // rather than being published straight to the client.
  private spawnPtyShellFor(label: string, cwd: string | undefined, sandbox: SandboxOptions): ShellProcess {
    let onData: (data: string) => void = () => {};
    const { shell, ptyId } = createPtyShell((handler) => {
      onData = handler;
      const session = this.managers.pty.spawnTransport(
        label, SHELL_NAME, SHELL_NAME, cwd ?? process.cwd(),
        { onData: (data) => onData(data), onExit: () => this.shellPtyIds.delete(label) },
        { sandbox, shellArgs: ptyShellArgs() },
      );
      return { write: (data) => session.write(data), kill: () => session.kill(), id: session.id };
    });
    this.shellPtyIds.set(label, ptyId);
    return shell;
  }

  // Run a command with transcript streaming, busy state, and persistence. This is the high-level
  // entry point for shell execution: it creates a running transcript entry, streams output as it
  // arrives, finalizes the entry on completion, and persists the tab. Accepts an optional callback
  // for when the full output is captured.
  run(label: string, command: string, options?: { onComplete?: (out: string) => void; detect?: boolean }): void {
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

    const promotion = createShellPromotion(
      this.managers, label, command, () => this.shellPtyIds.get(label),
      options?.detect !== false && getConfig().interactiveShellDetection,
    );
    this.promotions.set(label, promotion);

    this.execute(label, command, index, this.managers.tab.cwdOf(label), {
      onChunk: (buffer) => {
        promotion.observe(buffer);
        // Once the terminal has the screen, the entry stops collecting bytes: what would land in it
        // is half a repaint, and the finished entry reads as a note instead.
        if (!promotion.isPromoted()) update(buffer, true);
      },
      onDone: (result) => {
        const promoted = promotion.isPromoted();
        promotion.finish();
        this.promotions.delete(label);
        update(promoted ? TERMINAL_ENTRY_NOTE : result, false);
        this.managers.tab.markUnread(label);
        if (result && !promoted && tab) messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry: { input: '', output: result }, tab });
        options?.onComplete?.(promoted ? '' : result);
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
          handlers.onDone(result);
          queryShellPwd(shell, index, (pwd) => {
            if (pwd) handlers.onPwd(pwd);
            resolve();
          });
        });
      });
    })();
    this.shellQueues.set(label, next);
  }

  // Promote the tab's running command into a full-tab terminal, as the `open in terminal` action and
  // its chord ask for. A no-op when nothing is running, when the tab's shell is not pty-backed, or
  // when the command has already been promoted.
  promoteRunning(label: string): void {
    this.promotions.get(label)?.promote();
  }

  // Kill and forget a tab's shell. Returns whether a shell was actually open (drives the
  // `connection close shell` result message). On `connection close shell` and tab close.
  close(label: string): boolean {
    const shell = this.shells.get(label);
    if (!shell) return false;
    shell.kill();
    this.shells.delete(label);
    this.shellQueues.delete(label);
    this.shellPtyIds.delete(label);
    this.promotions.delete(label);
    return true;
  }

  // Kill every shell (app shutdown).
  closeAll(): void {
    for (const [, shell] of this.shells) shell.kill();
    this.shells.clear();
    this.shellQueues.clear();
    this.shellPtyIds.clear();
    this.promotions.clear();
  }

  dispose(): void {
    this.closeAll();
  }
}
