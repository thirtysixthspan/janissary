import { isInteractive } from '../interactive/index.js';
import { commands } from '../commands/index.js';
import { resolveCommand, type Resolution } from '../resolve.js';
import { routeUnknownCommand } from './router.js';
import type { Managers } from '../managers.js';

type Reply = (out: string) => void;

export class CaptureManager {
  constructor(private managers: Managers) {}

  // Classifies the text with the same resolver the command bar uses, so every shell spelling and
  // flag means what it means when typed; only the execution below is specific to a messaged command.
  run(label: string, text: string, callback: Reply): void {
    const res = resolveCommand(text);
    if (res.kind === 'shell') { this.runShell(res, label, callback); return; }

    const index = this.managers.tab.findIndex(label);
    if (index === -1) { callback('Tab not found'); return; }

    const rerun = (l: string, t: string, cb: Reply): void => { this.run(l, t, cb); };
    switch (res.kind) {
      case 'app': { void this.runCommand(res.name, res.cmd, label, index, callback); return;
      }
      case 'output':
      case 'unknown': { routeUnknownCommand(text, res.cmd, label, this.managers, rerun, callback); return;
      }
      case 'empty': { routeUnknownCommand(text, '', label, this.managers, rerun, callback); return;
      }
    }
  }

  // Never promoted: a messaged command has to return captured text to the agent that sent it, and a
  // command that took over a terminal has none to give. A `--pty` request is interactive by definition,
  // and a bare one would open the login shell, so that is what the refusal names.
  private runShell(res: Extract<Resolution, { kind: 'shell' }>, label: string, callback: Reply): void {
    if (res.pty || (res.cmd && isInteractive(res.cmd))) {
      callback(`Cannot run interactive command remotely: ${res.cmd || process.env.SHELL || 'bash'}`);
      return;
    }
    this.managers.shell.run(label, res.cmd, { onComplete: callback, detect: false });
  }

  private async runCommand(name: string, cmd: string, label: string, index: number, callback: Reply): Promise<void> {
    const command = commands.find((c) => c.name === name);
    if (command?.capture) { command.capture(cmd, label, this.managers, callback); return; }
    const tab = this.managers.tab.byLabel(label);
    const before = tab?.log.length ?? 0;
    await this.managers.command.executeCommand(name, cmd, label, index);
    const after = tab?.log.length ?? 0;
    callback(after > before ? tab!.log[after - 1].output : '');
  }
}
