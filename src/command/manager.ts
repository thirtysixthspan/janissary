import type { RouteChoice } from '../recognizers/types.js';
import { resolveCommand, type Resolution } from '../resolve.js';
import { isInteractive } from '../interactive/index.js';
import { commands } from '../commands/index.js';
import { toPrefixedCommand } from '../recognizers/index.js';
import { messageBus } from '../bus.js';
import { resolveUnknownCommand } from './router.js';
import { recordGlobalHistory } from '../global-history.js';
import type { Managers } from '../managers.js';
import { dispatchOrRunOp, drainQueueOp } from './queue.js';
import { errorText } from '../error-text.js';

type PendingRoute = { label: string; cmd: string; choices: RouteChoice[] };

const ROUTE_BUSY = 'Another command is waiting for a route choice; run this again once it is answered.';

export class CommandManager {
  private pendingRoute: PendingRoute | null = null;

  constructor(private managers: Managers) {
    this.managers.tab.setOnIdle((label) => this.drainQueue(label));
  }

  routeView(): { cmd: string; choices: string[] } | null {
    if (!this.pendingRoute) return null;
    return { cmd: this.pendingRoute.cmd, choices: this.pendingRoute.choices.map((c) => c.label) };
  }

  chooseRoute(index: number): void {
    const pending = this.pendingRoute;
    this.pendingRoute = null;
    if (pending && index >= 0 && index < pending.choices.length) {
      const index_ = this.managers.tab.findIndex(pending.label);
      if (index_ !== -1) this.run(toPrefixedCommand(pending.cmd, pending.choices[index]), pending.label, index_);
    }
    if (pending) this.drainQueue(pending.label);
    messageBus.emit('state', { type: 'dirty' });
  }

  closeTab(label: string): void {
    if (this.pendingRoute?.label !== label) return;
    this.pendingRoute = null;
    messageBus.emit('state', { type: 'dirty' });
  }

  // The chooser slot is claimed, never overwritten: a second unknown command, from another tab or
  // from a scheduled firing in the owning one, would otherwise silently discard the command already
  // waiting on the open chooser, so it is refused in its own transcript instead.
  private holdRoute(pending: PendingRoute | null): void {
    if (pending && this.pendingRoute) {
      this.managers.tab.append(pending.label, { input: pending.cmd, output: ROUTE_BUSY });
      return;
    }
    this.pendingRoute = pending;
  }

  dispatch(text: string): void {
    const trimmed = this.managers.tab.recordHistory(this.managers.tab.activeTab, text);
    if (trimmed) recordGlobalHistory(trimmed, this.managers.tab.cur().label);
    this.dispatchOrRun(trimmed, this.managers.tab.cur().label, this.managers.tab.activeTab);
  }

  // `detect: false` marks a command nobody is watching interactively — a scheduled firing — so a
  // program that takes over the screen never steals the tab. A command that queues behind a busy
  // agent loses the flag, since the queue holds plain strings; accepted, and noted in the spec.
  dispatchTo(label: string, text: string, options?: { detect?: boolean }): void {
    const index = this.managers.tab.findIndex(label);
    if (index === -1) return;
    const trimmed = this.managers.tab.recordHistory(index, text);
    if (trimmed) recordGlobalHistory(trimmed, label);
    this.dispatchOrRun(trimmed, label, index, options?.detect);
  }

  // Gate seam: agent tabs queue while busy (or while idle with entries already waiting, to
  // preserve FIFO) instead of running immediately. Non-agent tabs and empty input bypass the gate.
  private dispatchOrRun(trimmed: string, label: string, index: number, detect?: boolean): void {
    dispatchOrRunOp(
      this.managers, trimmed, label, index,
      (i, l, idx) => this.run(i, l, idx, detect), (l) => this.drainQueue(l),
    );
  }

  // Runs queued commands FIFO until the tab goes busy, its queue empties, or one of its own
  // commands opens a route chooser (resumed by `chooseRoute`); another tab's chooser never pauses
  // it. Registered as `TabManager`'s onIdle hook.
  drainQueue(label: string): void {
    drainQueueOp(this.managers, label, () => this.pendingRoute?.label === label, (i, l, idx) => this.run(i, l, idx));
  }

  private run(input: string, label: string, index: number, detect?: boolean): void {
    const res = resolveCommand(input);
    switch (res.kind) {
      case 'empty': { return;
      }
      case 'shell': { this.runShell(res, label, detect); return;
      }
      case 'output': { this.managers.tab.append(label, { input, output: res.output, markdown: true }); return;
      }
      case 'unknown': {
        resolveUnknownCommand(res.cmd, label, this.managers, (input, l, idx) => this.run(input, l, idx), (p) => this.holdRoute(p));
        return;
      }
      case 'app': { void this.executeCommand(res.name, res.cmd, label, index); return;
      }
    }
  }

  // Routes a `shell` resolution to either the piped shell or a PTY: auto-detected interactive
  // commands and any `--pty`-flagged command (including a bare `shell --pty`, which falls back
  // to the user's login shell) go to the PTY; everything else runs in the tab's piped shell.
  private runShell(res: Extract<Resolution, { kind: 'shell' }>, label: string, detect?: boolean): void {
    if (!res.pty && !(res.cmd && isInteractive(res.cmd))) { this.managers.shell.run(label, res.cmd, { detect }); return;
    }
    const fallbackShell = process.env.SHELL || 'bash';
    const command = res.cmd || fallbackShell;
    const program = res.cmd ? res.cmd.split(/\s+/, 1)[0] : fallbackShell.split('/').pop()!;
    this.managers.pty.openInlinePty(label, command, program);
  }

  async executeCommand(name: string, command: string, label: string, index: number): Promise<void> {
    const cmd = commands.find((c) => c.name === name);
    if (!cmd) return;
    try {
      await cmd.run(command, { label, index }, this.managers);
    } catch (error) {
      const output = errorText(error);
      this.managers.tab.append(label, { input: command, output });
    }
  }
}
