import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';

// `edit <file>` — open the in-app plain-text editor on any file, regardless of which opener owns
// its extension (`open readme.md` keeps the rendered view; `edit readme.md` opens the editor).
export const command: Command = {
  name: 'edit',
  match: (command_) => /^edit\b/i.test(command_),
  samples: ['edit', 'edit notes.txt'],
  run: (command, tab, managers, invocation) => {
    const target = command.replace(/^edit\b\s*/i, '').trim();
    if (!target) { appendCommandOutput(managers, tab.label, { input: command, output: 'Usage: edit <file>' }, invocation); return; }
    const lineMatch = /^(.+):(\d+)$/.exec(target);
    const path = lineMatch ? lineMatch[1] : target;
    const line = lineMatch ? Number(lineMatch[2]) : undefined;
    appendCommandOutput(managers, tab.label, { input: command, output: '' }, invocation);
    managers.openFile.edit(command, path, tab.label, line);
  },
};
