import type { Command } from './types.js';

// `edit <file>` — open the in-app plain-text editor on any file, regardless of which opener owns
// its extension (`open readme.md` keeps the rendered view; `edit readme.md` opens the editor).
export const command: Command = {
  name: 'edit',
  match: (command_) => /^edit\b/i.test(command_),
  run: (command, tab, managers) => {
    const target = command.replace(/^edit\b\s*/i, '').trim();
    if (!target) { managers.tab.append(tab.label, { input: command, output: 'Usage: edit <file>' }); return; }
    const lineMatch = /^(.+):(\d+)$/.exec(target);
    const path = lineMatch ? lineMatch[1] : target;
    const line = lineMatch ? Number(lineMatch[2]) : undefined;
    managers.tab.append(tab.label, { input: command, output: '' });
    managers.openFile.edit(command, path, tab.label, line);
  },
};
