import { isInteractive } from './interactive.js';
import { getOutput } from './commands.js';
import { commands } from './commands/index.js';
import { analyzeCommand, toPrefixedCommand } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';
import type { Managers } from './managers.js';

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
        if (c.name === 'acp') { this.managers.acp.run(label, trimmed, callback); return; }
        if (c.name === 'browser') { this.managers.browser.runInteractive(trimmed, label, callback); return; }
        const tab = this.managers.tab.tabs.find((t) => t.label === label);
        const before = tab?.log.length ?? 0;
        this.managers.command.executeCommand(c.name, trimmed, label, index);
        const after = this.managers.tab.tabs.find((t) => t.label === label)?.log.length ?? 0;
        callback(after > before ? this.managers.tab.tabs.find((t) => t.label === label)!.log[after - 1].output : '');
        return;
      }
    }

    const output = getOutput(trimmed);
    if (output !== null && !output.startsWith('Unknown command:')) {
      this.managers.tab.append(label, { input: text, output, markdown: trimmed === 'help' });
      callback(output);
      return;
    }

    const openDbs = this.managers.database.openDbs(label);
    const decision = analyzeCommand(trimmed, { openDbs });
    if (decision.kind === 'route' && (decision.route !== 'db' || openDbs.length === 1)) {
      const choice: RouteChoice = decision.route === 'db'
        ? { label: '', route: 'db', dbName: openDbs[0] }
        : { label: '', route: decision.route };
      this.run(label, toPrefixedCommand(trimmed, choice), callback);
      return;
    }
    callback(output ?? `Unknown command: "${trimmed}".`);
  }
}
