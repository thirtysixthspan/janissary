import { isInteractive } from '../interactive.js';
import { commands } from '../commands/index.js';
import { routeUnknownCommand } from './router.js';
import type { Managers } from '../managers.js';

export class CaptureManager {
  constructor(private managers: Managers) {}

  run(label: string, text: string, callback: (out: string) => void): void {
    if (/^shell\b/i.test(text)) {
      const command = text.replace(/^shell\b\s*/i, '');
      if (command && isInteractive(command)) { callback(`Cannot run interactive command remotely: ${command}`); return; }
      this.managers.shell.run(label, command, { onComplete: callback });
      return;
    }

    const trimmed = text.replace(/^\//, '');
    const index = this.managers.tab.findIndex(label);
    if (index === -1) { callback('Tab not found'); return; }

    for (const c of commands) {
      if (c.match(trimmed)) {
        this.dispatchMatchedCommand(c, trimmed, label, index, callback);
        return;
      }
    }

    routeUnknownCommand(text, trimmed, label, this.managers, (l, t, cb) => this.run(l, t, cb), callback);
  }

  private dispatchMatchedCommand(
    c: (typeof commands)[number],
    trimmed: string,
    label: string,
    index: number,
    callback: (out: string) => void,
  ): void {
    if (c.name === 'acp') { this.managers.acp.run(label, trimmed, callback); return; }
    if (c.name === 'browser') { this.managers.browser.runInteractive(trimmed, label, callback); return; }
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    const before = tab?.log.length ?? 0;
    this.managers.command.executeCommand(c.name, trimmed, label, index);
    const after = this.managers.tab.tabs.find((t) => t.label === label)?.log.length ?? 0;
    callback(after > before ? this.managers.tab.tabs.find((t) => t.label === label)!.log[after - 1].output : '');
  }
}
