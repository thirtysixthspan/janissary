import type { RouteChoice } from '../recognizers/types.js';
import type { Resolution } from '../resolve.js';
import { resolveInTab } from './resolve-in-tab.js';
import { isInteractive } from '../interactive/index.js';
import { findCommand } from '../commands/index.js';
import { toPrefixedCommand } from '../recognizers/route-choices.js';
import { messageBus } from '../bus.js';
import { resolveUnknownCommand } from './router.js';
import { recordGlobalHistory } from '../global-history.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';
import { executeAndCapture } from '../capture/execute-and-capture.js';

type PendingRoute = { label: string; cmd: string; choices: RouteChoice[] };

const DISPATCH_CAPTURE_LIMIT_MS = 30_000;

const ROUTE_BUSY ='Another command is waiting for a route choice; run this again once it is answered.';

export class CommandManager {
  private pendingRoute: PendingRoute | null = null;

  constructor(private managers: Managers) {}

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
    this.run(trimmed, this.managers.tab.cur().label, this.managers.tab.activeTab);
  }

  // `detect: false` marks a command nobody is watching interactively — a scheduled firing — so a
  // program that takes over the screen never steals the tab.
  dispatchTo(label: string, text: string, options?: { detect?: boolean }): void {
    const index = this.managers.tab.findIndex(label);
    if (index === -1) return;
    const trimmed = this.managers.tab.recordHistory(index, text);
    if (trimmed) recordGlobalHistory(trimmed, label);
    this.run(trimmed, label, index, options?.detect);
  }

  private run(input: string, label: string, index: number, detect?: boolean): void {
    const res = resolveInTab(input, label, this.managers);
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

  // Offers one line to the ordinary dispatcher and answers whether the application claimed it, with
  // the output it added to the tab.
  //
  // Deliberately narrower than `run`: a resolution to the `shell` route or to nothing at all is not
  // an application command, so both report `false` and the caller decides what they mean. What counts
  // as claimed is a registry entry or a built-in that answers with output — the two kinds `run`
  // handles without a route chooser or a shell in the middle.
  //
  // The wait is bounded because nothing else bounds it: the plugin asking is not charged for the
  // command's runtime, so a command that never finishes would otherwise hold the caller forever.
  async dispatchLineWithOutput(
    label: string,
    input: string,
    captureLimitMs = DISPATCH_CAPTURE_LIMIT_MS,
  ): Promise<{ dispatched: boolean; output: string; coreResponse?: boolean }> {
    const resolution = resolveInTab(input, label, this.managers);
    if (resolution.kind === 'output') {
      this.managers.tab.append(label, { input, output: resolution.output, markdown: true });
      return { dispatched: true, output: resolution.output };
    }
    if (resolution.kind !== 'app') return { dispatched: false, output: '' };

    if (findCommand(resolution.name, resolution.cmd)?.coreResponse) {
      await this.executeCommand(resolution.name, resolution.cmd, label, this.managers.tab.findIndex(label));
      return { dispatched: true, output: '', coreResponse: true };
    }

    const output = await executeAndCapture(
      label,
      () => this.executeCommand(resolution.name, resolution.cmd, label, this.managers.tab.findIndex(label)),
      captureLimitMs,
    );
    return { dispatched: true, output: output.join('\n') };
  }

  async executeCommand(name: string, command: string, label: string, index: number): Promise<void> {
    const cmd = findCommand(name, command);
    if (!cmd) return;
    if (cmd.available?.(label, this.managers) === false) {
      this.run(command, label, index);
      return;
    }
    try {
      await cmd.run(command, { label, index }, this.managers);
    } catch (error) {
      const output = errorText(error);
      this.managers.tab.append(label, { input: command, output });
    }
  }
}
