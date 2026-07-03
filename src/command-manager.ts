import type { RouteChoice } from './recognizers/types.js';
import { resolveCommand } from './resolve.js';
import { isInteractive } from './interactive.js';
import { commands } from './commands/index.js';
import { toPrefixedCommand } from './recognizers/index.js';
import { messageBus } from './bus.js';
import { resolveUnknownCommand } from './command-router.js';
import { recordGlobalHistory } from './global-history.js';
import type { Managers } from './managers.js';

export class CommandManager {
  private pendingRoute: { label: string; cmd: string; choices: RouteChoice[] } | null = null;

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

  dispatch(text: string): void {
    const trimmed = this.managers.tab.recordHistory(this.managers.tab.activeTab, text);
    if (trimmed) recordGlobalHistory(trimmed, this.managers.tab.cur().label);
    this.run(trimmed, this.managers.tab.cur().label, this.managers.tab.activeTab);
  }

  dispatchTo(label: string, text: string): void {
    const index = this.managers.tab.findIndex(label);
    if (index === -1) return;
    const trimmed = this.managers.tab.recordHistory(index, text);
    if (trimmed) recordGlobalHistory(trimmed, label);
    this.run(trimmed, label, index);
  }

  private run(input: string, label: string, index: number): void {
    if (/^harness\b/i.test(input)) {
      this.managers.tab.append(label, { input, output: '' });
      const error = this.managers.harness.run(input);
      if (error) this.managers.tab.append(label, { input: '', output: error });
      return;
    }
    const res = resolveCommand(input);
    switch (res.kind) {
      case 'empty': { return;
      }
      case 'shell': {
        if (res.cmd && isInteractive(res.cmd)) this.managers.pty.openInlinePty(label, res.cmd, res.cmd.split(/\s+/, 1)[0]);
        else this.managers.shell.run(label, res.cmd);
        return;
      }
      case 'output': { this.managers.tab.append(label, { input, output: res.output, markdown: true }); return;
      }
      case 'unknown': {
        resolveUnknownCommand(res.cmd, label, this.managers, (input, l, idx) => this.run(input, l, idx), (p) => { this.pendingRoute = p; });
        return;
      }
      case 'app': { this.executeCommand(res.name, res.cmd, label, index); return;
      }
    }
  }

  executeCommand(name: string, command: string, label: string, index: number): void {
    const cmd = commands.find((c) => c.name === name);
    if (cmd) cmd.run(command, { label, index }, this.managers);
  }
}
