import type { Command } from './types.js';

// `newfile <file>` — internal command the file navigator's "New file" button and Cmd+N send.
// Distinct from `edit`: it always resolves to a name that isn't taken yet, opening `untitled-2.md`
// instead of the existing `untitled.md` when the default name collides.
export const command: Command = {
  name: 'newfile',
  match: (command_) => /^newfile\b/i.test(command_),
  run: (command, tab, managers) => {
    const target = command.replace(/^newfile\b\s*/i, '').trim();
    if (!target) { managers.tab.append(tab.label, { input: command, output: 'Usage: newfile <file>' }); return; }
    managers.tab.append(tab.label, { input: command, output: '' });
    managers.openFile.newFile(command, target, tab.label);
  },
};
